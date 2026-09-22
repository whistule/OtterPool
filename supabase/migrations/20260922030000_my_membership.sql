-- my_membership(): the caller's own membership snapshot for the in-app banner.
--
-- A member's expiry date lives in verified_members, which is RLS-locked to the
-- service role — members can't read it directly. This SECURITY DEFINER function
-- returns ONLY the calling user's own status, expiry and trial usage (never
-- anyone else's), so the app can show "verified member", "lapses on XX" and the
-- aspirant trial count without exposing the list.
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
  where s.member_id = v_uid and s.status <> 'declined';

  return jsonb_build_object('status', v_status, 'expires_on', v_expires, 'trials_used', v_trials);
end;
$$;

revoke all on function public.my_membership() from public, anon;
grant execute on function public.my_membership() to authenticated;
