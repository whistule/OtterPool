-- Fix: import_verified_members failed at runtime with "DELETE requires a WHERE
-- clause". Supabase runs with the safeupdate guard, which rejects an
-- unqualified DELETE. The function clears the mirror before re-filling it, so
-- give that delete an explicit all-rows WHERE.
--
-- create-or-replace only; no data change. See docs/membership-verification.md.
create or replace function public.import_verified_members(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_expiring int;
begin
  if not (select public.is_membership_admin()) then
    raise exception 'not authorised';
  end if;

  delete from public.verified_members where true;

  insert into public.verified_members (email_norm, expires_on)
  select distinct on (email_norm) email_norm, expires_on
  from (
    select
      lower(trim(r ->> 'email')) as email_norm,
      nullif(trim(coalesce(r ->> 'expires', '')), '')::date as expires_on
    from jsonb_array_elements(p_rows) as r
    where trim(coalesce(r ->> 'email', '')) <> ''
      and position('@' in (r ->> 'email')) > 1
  ) x
  order by email_norm, expires_on desc nulls last;

  select count(*) into v_count from public.verified_members;
  select count(*) into v_expiring
  from public.verified_members
  where expires_on is not null and expires_on < current_date;

  return jsonb_build_object('imported', v_count, 'already_expired', v_expiring)
    || public.reconcile_membership();
end;
$$;
