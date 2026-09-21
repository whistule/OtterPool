-- ============================================================
-- OtterPool — Close three RLS escalation holes
-- ============================================================
-- 1. profiles.level / profiles.status were self-writable. The
--    "Users can update own profile" policy covers every column and
--    guard_profile_admin_flag only protected the three is_*_admin
--    flags, so any member could `update profiles set level='selkie',
--    status='active'` — granting event creation, passing every
--    min_level gate in the sign-up function, and defeating the
--    lapsed/suspended block. The UI has always treated level as
--    paddling-admin-only and status as membership-admin-only; this
--    makes the database agree.
--
-- 2. event_signups INSERT only checked member_id, so a member could
--    insert status='confirmed' directly and skip the sign-up edge
--    function entirely — no payment, no capacity, no level check.
--    Nothing in the app inserts sign-ups client-side (the edge
--    function uses the service role and bypasses RLS), so pinning the
--    status to the table default costs nothing.
--
-- 3. Two policies had USING but no WITH CHECK. Postgres applies USING
--    to the pre-update row only, so the *new* row went unchecked and
--    an owner could hand their row to someone else
--    (events.leader_id, profiles.id).

-- ---------- 1. guard level and status alongside the role flags ----------

create or replace function public.guard_profile_admin_flag()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- auth.uid() is null for the service role (admin API, seeds). RLS keeps
  -- anon out of profiles entirely, so a null uid means the trusted backend.
  if auth.uid() is null then
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

  if new.status is distinct from old.status and not public.is_membership_admin() then
    raise exception 'only membership admins can change a member status';
  end if;

  return new;
end;
$$;

-- ---------- 2. members may only open a sign-up for review ----------

drop policy if exists "Members can sign up for events" on public.event_signups;
create policy "Members can sign up for events"
  on public.event_signups for insert
  to authenticated
  with check (member_id = auth.uid() and status = 'pending_review');

-- ---------- 3. an update may not reassign the row to someone else ----------

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "Leaders can update own events" on public.events;
create policy "Leaders can update own events"
  on public.events for update
  to authenticated
  using (leader_id = auth.uid())
  with check (leader_id = auth.uid());

-- ---------- 4. the calendar counts held seats as taken ----------
-- Matches confirmedCount() in supabase/functions/_shared/capacity.ts: a
-- pending_payment row is a seat someone is on the checkout page for, so
-- "N of M left" must not offer it to anyone else.

create or replace view public.calendar_events as
select
  e.id,
  e.title,
  c.name as category,
  e.grade_advertised,
  e.starts_at,
  e.ends_at,
  e.location,
  e.min_level,
  e.max_participants,
  e.cost,
  e.status,
  e.leader_id,
  e.photo_path,
  p.display_name as leader_name,
  p.avatar_path as leader_avatar_path,
  count(s.id) filter (where s.status in ('confirmed', 'pending_payment')) as confirmed_count
from public.events e
join public.event_categories c on c.id = e.category_id
join public.profiles p on p.id = e.leader_id
left join public.event_signups s on s.event_id = e.id
where e.status in ('open', 'full')
group by e.id, c.name, p.display_name, p.avatar_path;
