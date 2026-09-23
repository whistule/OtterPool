-- ============================================================
-- OtterPool — two guard fixes from the membership/assistant review
-- ============================================================

-- ---------- 1. claim_membership() could never actually claim ----------
-- profiles_guard_admin_flag (20260430020000, rewritten in 20260804000000)
-- raises 'only membership admins can change a member status' whenever
-- profiles.status changes and the caller isn't a membership admin. That guard
-- is right for the Data API, but claim_membership() is exactly the case it
-- shouldn't catch: a SECURITY DEFINER function is *not* invisible to it, since
-- auth.uid() reads the request JWT, not the current role — so inside the
-- function the caller is still the aspirant, and every claim raised. The app
-- discards the RPC error, so match-on-sign-in failed silently and no aspirant
-- was ever upgraded.
--
-- Give the trigger one escape hatch: a transaction-local GUC that only a
-- trusted definer function sets. set_config(..., true) is scoped to the calling
-- transaction, so it cannot leak to the next request on a pooled connection,
-- and a member has no way to set it themselves — PostgREST won't pass it and
-- the only setter is claim_membership's own body.
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

  if new.status is distinct from old.status and not public.is_membership_admin() then
    raise exception 'only membership admins can change a member status';
  end if;

  return new;
end;
$$;

-- Unchanged from 20260922010000 except for the set_config line. Still only ever
-- upgrades the caller's own aspirant row, and only on an unexpired membership.
create or replace function public.claim_membership()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_matched boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select lower(trim(u.email)) into v_email from auth.users u where u.id = v_uid;
  v_matched := exists (
    select 1 from public.verified_members v
    where v.email_norm = v_email
      and (v.expires_on is null or v.expires_on >= current_date)
  );

  if v_matched then
    perform set_config('app.trusted_status_change', 'on', true);
    update public.profiles
    set status = 'active', membership_source = 'list'
    where id = v_uid and status = 'aspirant';
    perform set_config('app.trusted_status_change', 'off', true);
  end if;

  return jsonb_build_object('matched', v_matched);
end;
$$;

-- ---------- 2. an assistant could promote themselves to leader ----------
-- "Assistants can update their events" (20260921010000) has no WITH CHECK, so
-- the USING expression guards the new row: the assistant must still be the
-- assistant afterwards — but nothing stopped them setting leader_id to
-- themselves, which hands them sign-up review, the one thing that migration
-- says an assistant must not have.
--
-- A trigger rather than a policy WITH CHECK, because WITH CHECK can't see the
-- old row: reassignment has to be compared against who the leader *was*. It
-- also covers every other route to the column at once, rather than one policy.
create or replace function public.guard_event_leader_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Service role / trusted backend (seeds, edge functions).
  if auth.uid() is null then
    return new;
  end if;
  if new.leader_id is distinct from old.leader_id
     and old.leader_id is distinct from auth.uid()
     and not public.is_paddling_admin() then
    raise exception 'only the event leader or a paddling admin can reassign an event';
  end if;
  return new;
end;
$$;

drop trigger if exists events_guard_leader_change on public.events;
create trigger events_guard_leader_change
  before update on public.events
  for each row execute function public.guard_event_leader_change();
