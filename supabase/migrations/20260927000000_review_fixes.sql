-- ============================================================
-- OtterPool — fixes from the 2026-09-27 correctness/security review
-- ============================================================

-- ---------- 1. only selkies (or paddling admins) can create events ----------
-- The selkie gate lived only in the UI (app/(tabs)/index.tsx, event-form.tsx).
-- The policy let any signed-in account insert an event it leads, and with
-- public sign-up that is anyone — who could then post to the calendar and
-- fire notify-event-created at every subscriber.
drop policy if exists "Leaders can create events" on public.events;
create policy "Leaders can create events"
  on public.events for insert
  to authenticated
  with check (
    (
      leader_id = auth.uid()
      and exists (select 1 from public.profiles p where p.id = auth.uid() and p.level = 'selkie')
    )
    or public.is_paddling_admin()
  );

-- ---------- 2. membership_source is a membership-admin column ----------
-- reconcile_membership() only lapses rows with membership_source = 'list', so a
-- member who set their own row to 'manual' before expiry stayed active for good.
-- Otherwise unchanged from 20260923000000.
create or replace function public.guard_profile_admin_flag()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- auth.uid() is null for the service role (admin API, seeds). RLS keeps
  -- anon out of profiles entirely, so a null uid means the trusted backend.
  if auth.uid() is null then
    return new;
  end if;

  -- Set only by claim_membership(), which has already verified the caller's
  -- own confirmed email against verified_members.
  if coalesce(current_setting('app.trusted_status_change', true), '') = 'on' then
    return new;
  end if;

  if (new.is_admin is distinct from old.is_admin
      or new.is_membership_admin is distinct from old.is_membership_admin
      or new.is_paddling_admin is distinct from old.is_paddling_admin)
     and not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'only super admins can change admin roles';
  end if;

  if new.level is distinct from old.level and not public.is_paddling_admin() then
    raise exception 'only paddling admins can change a member level';
  end if;

  if (new.status is distinct from old.status
      or new.membership_source is distinct from old.membership_source)
     and not public.is_membership_admin() then
    raise exception 'only membership admins can change a member status';
  end if;

  return new;
end;
$$;

-- ---------- 3. an unpaid checkout holds a trial, like it holds a seat ----------
-- Not counting pending_payment let an aspirant open checkout on any number of
-- paid trips and then pay for all of them — nothing re-checks at payment time,
-- and a payment can't be refused once taken. A held checkout is released by
-- checkout.session.expired two hours after checkout opens, which frees the trial too.
-- Mirrors countTrialSignups() in the sign-up edge function.
create or replace function public.my_membership()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status text;
  v_expires date;
  v_trials int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select p.status into v_status from public.profiles p where p.id = v_uid;

  select v.expires_on into v_expires
  from public.verified_members v
  join auth.users u on u.id = v_uid
  where v.email_norm = lower(trim(u.email));

  select count(*) into v_trials
  from public.event_signups s
  where s.member_id = v_uid
    and s.status in ('confirmed', 'pending_payment', 'pending_review', 'waitlisted');

  return jsonb_build_object('status', v_status, 'expires_on', v_expires, 'trials_used', v_trials);
end;
$$;

-- ---------- 4. capacity is enforced by the database ----------
-- The edge functions count seats and then write, in separate requests, so two
-- sign-ups for the last seat could both see it free. Locking the event row
-- serialises every write that takes a seat on the same event; the count after
-- the lock sees whichever one committed first. The loser gets 'event_full' and
-- the sign-up / review functions route it to the waitlist.
--
-- Only a transition INTO a held status is checked — pending_payment → confirmed
-- (the webhook) is the same seat changing hands, not a new one. Applies to
-- leaders and admins writing through RLS too: to overbook, raise the cap.
create or replace function public.enforce_event_capacity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_max int;
  v_held int;
begin
  if new.status not in ('confirmed', 'pending_payment') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status in ('confirmed', 'pending_payment') then
    return new;
  end if;

  select e.max_participants into v_max from public.events e where e.id = new.event_id for update;
  if v_max is null then
    return new;
  end if;

  select count(*) into v_held
  from public.event_signups s
  where s.event_id = new.event_id
    and s.status in ('confirmed', 'pending_payment')
    and s.id <> new.id;

  if v_held >= v_max then
    raise exception 'event_full';
  end if;
  return new;
end;
$$;

drop trigger if exists event_signups_enforce_capacity on public.event_signups;
create trigger event_signups_enforce_capacity
  before insert or update of status on public.event_signups
  for each row execute function public.enforce_event_capacity();

-- ---------- 5. a payment that matches no sign-up is still recorded ----------
-- The webhook only confirms rows still in pending_payment. A sign-up cancelled
-- while its checkout was open, or cascade-deleted with its event, used to make
-- the payment vanish: Stripe took the money and the database had no trace.
-- No foreign keys on purpose — the rows these point at may be gone.
create table if not exists public.unmatched_payments (
  payment_intent_id text primary key,
  signup_id         uuid,
  event_id          uuid,
  member_id         uuid,
  amount_pence      int not null,
  created_at        timestamptz not null default now()
);

alter table public.unmatched_payments enable row level security;

drop policy if exists "Paddling admins read unmatched payments" on public.unmatched_payments;
create policy "Paddling admins read unmatched payments"
  on public.unmatched_payments for select
  to authenticated
  using (public.is_paddling_admin());

-- ---------- 5b. which checkout session holds the seat ----------
-- Every retry opens a new Checkout session. Only the latest one may release
-- the seat when it expires, otherwise an abandoned first attempt expiring
-- withdraws a seat the member is paying for through a second one.
alter table public.event_signups
  add column if not exists checkout_session_id text;

-- ---------- 6. storage buckets only take images ----------
-- The app uploads downscaled JPEGs (lib/photos.ts); png/webp stay allowed for
-- anything uploaded before that. Without this either public bucket would host
-- any file type up to the 50 MiB project limit.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'],
    file_size_limit = 5 * 1024 * 1024
where id in ('avatars', 'event-photos');

-- ---------- 7. experience RPCs use the shared role predicate ----------
-- They each inlined `is_admin or is_paddling_admin`, which is exactly
-- is_paddling_admin(). One definition, so the rule can't drift.
create or replace function public.admin_member_experience(p_member_id uuid)
returns table (
  member_id                   uuid,
  experience_answers          jsonb,
  experience_review_requested boolean,
  experience_submitted_at     timestamptz,
  experience_reviewed_at      timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select mp.member_id, mp.experience_answers, mp.experience_review_requested,
         mp.experience_submitted_at, mp.experience_reviewed_at
  from public.member_private mp
  where mp.member_id = p_member_id
    and public.is_paddling_admin();
$$;

create or replace function public.admin_pending_experience()
returns table (
  id                      uuid,
  full_name               text,
  display_name            text,
  level                   text,
  experience_submitted_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.display_name, p.level::text, mp.experience_submitted_at
  from public.member_private mp
  join public.profiles p on p.id = mp.member_id
  where mp.experience_review_requested
    and public.is_paddling_admin()
  order by mp.experience_submitted_at desc nulls last;
$$;

create or replace function public.admin_mark_experience_reviewed(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_paddling_admin() then
    raise exception 'not authorised';
  end if;
  update public.member_private
    set experience_review_requested = false,
        experience_reviewed_at = now()
    where member_id = p_member_id;
end;
$$;
