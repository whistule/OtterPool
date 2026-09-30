-- ============================================================
-- OtterPool — Match paid members server-side, not via a client race
-- ============================================================
-- Bug: a genuine paid member saw the "Welcome — 3 trial sessions" screen
-- on their very first sign-in.
--
-- Why: a new signup starts as 'aspirant'. The only thing that upgraded a
-- listed member to 'active' was claim_membership(), fired from the client
-- (auth.tsx) AFTER the profile had already loaded as aspirant. The trial
-- popup/banner call my_membership() independently when the Calendar mounts,
-- and on a first sign-in that read can win the race — returning 'aspirant'
-- and showing the trial screen — a moment before the upgrade lands. The
-- member ends up 'active', but the first impression is wrong.
--
-- Fix: match server-side.
--   (1) The instant a user's email is confirmed, a trigger upgrades them if
--       they're on the (unexpired) list — so they are 'active' before the
--       app ever loads, on every screen.
--   (2) my_membership() also matches the caller first, so the popup/banner
--       can never report a stale 'aspirant' to someone who qualifies. This
--       also covers profiles that predate this migration.
-- Both reuse one helper. Security is unchanged: the match only ever runs for
-- a CONFIRMED email (proof of address ownership) — the same property
-- claim_membership relied on.

-- Shared matcher: upgrade this user's aspirant profile to active + list iff
-- their email is confirmed and on the list and unexpired. The WHERE clause
-- keeps Supabase's safeupdate guard happy and makes it a no-op for anyone who
-- doesn't qualify (already active, off the list, expired, unconfirmed).
create or replace function public.match_member_to_list(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p
  set status = 'active', membership_source = 'list'
  from auth.users u
  where p.id = p_uid
    and u.id = p_uid
    and u.email_confirmed_at is not null
    and p.status = 'aspirant'
    and exists (
      select 1 from public.verified_members v
      where v.email_norm = lower(trim(u.email))
        and (v.expires_on is null or v.expires_on >= current_date)
    );
end;
$$;

-- Only the SECURITY DEFINER callers below (which run as the owner) invoke it;
-- no member should be able to call it directly.
revoke all on function public.match_member_to_list(uuid) from public, anon, authenticated;

-- (1) Fire it the moment email confirmation lands. A brand-new listed member
-- is then 'active' before their first authenticated request.
create or replace function public.handle_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    perform public.match_member_to_list(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.handle_email_confirmed();

-- (2) Belt-and-braces: my_membership() matches the caller first, so the trial
-- popup/banner can never show a stale aspirant state to a member on the list.
-- Body is otherwise identical to 20260927000000_review_fixes.sql; grants are
-- preserved across create-or-replace.
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

  perform public.match_member_to_list(v_uid);

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
