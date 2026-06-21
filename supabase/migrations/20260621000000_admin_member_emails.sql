-- ============================================================
-- OtterPool — Admin-only access to member email addresses
-- ============================================================
-- Email lives in auth.users, which is not exposed to the Data API.
-- This SECURITY DEFINER function returns member emails ONLY when the
-- caller is an admin (the EXISTS guard returns zero rows otherwise),
-- so ordinary members can never read other members' emails.
--
-- Pass p_member_id to fetch a single member, or null for all.

create or replace function public.admin_member_emails(p_member_id uuid default null)
returns table (id uuid, email text)
language sql
security definer
set search_path = ''
as $$
  select u.id, u.email::text
  from auth.users u
  where exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_admin
  )
  and (p_member_id is null or u.id = p_member_id);
$$;

-- SECURITY DEFINER functions in public are callable by PUBLIC by default.
-- The body already gates on is_admin, but lock execution to signed-in users
-- as defence in depth.
revoke all on function public.admin_member_emails(uuid) from public, anon;
grant execute on function public.admin_member_emails(uuid) to authenticated;
