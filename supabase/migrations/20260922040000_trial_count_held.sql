-- Refine the aspirant trial counter: a trial is used only by a place the
-- member actually HOLDS — confirmed, awaiting review, or waitlisted. A place
-- they cancelled (withdrawn), a leader-declined request, or a paid sign-up
-- they never paid for (pending_payment) no longer counts. So cancelling or
-- not paying frees the trial, and a sign-up isn't "complete" (for the cap)
-- until it's an actual place — which for a paid event means paid.
--
-- Mirrors countTrialSignups() in the sign-up edge function. create-or-replace
-- only; no data change.
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
    and s.status in ('confirmed', 'pending_review', 'waitlisted');

  return jsonb_build_object('status', v_status, 'expires_on', v_expires, 'trials_used', v_trials);
end;
$$;
