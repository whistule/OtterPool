-- ============================================================
-- OtterPool — Let the service role manage admin role flags
-- ============================================================
-- guard_profile_admin_flag blocked anyone but a super admin from
-- changing the role flags — but it also blocked the service role
-- (admin API / seeds), whose auth.uid() is null. Authenticated users
-- always have a uid, and anon can't update profiles (RLS), so a null
-- uid here means the trusted backend. Allow it.

create or replace function public.guard_profile_admin_flag()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.is_admin is distinct from old.is_admin
      or new.is_membership_admin is distinct from old.is_membership_admin
      or new.is_paddling_admin is distinct from old.is_paddling_admin)
     and auth.uid() is not null
     and not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'only super admins can change admin roles';
  end if;
  return new;
end;
$$;
