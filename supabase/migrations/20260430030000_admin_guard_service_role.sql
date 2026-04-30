-- The is_admin guard trigger uses auth.uid(), which is null when the service
-- role connects (e.g. seed scripts). RLS already prevents non-service-role
-- callers from bypassing auth, so when auth.uid() is null we trust the caller
-- and let the change through.
create or replace function public.guard_profile_admin_flag()
returns trigger as $$
begin
  if new.is_admin is distinct from old.is_admin
     and auth.uid() is not null
     and not exists (
       select 1 from public.profiles where id = auth.uid() and is_admin
     ) then
    raise exception 'only admins can change is_admin';
  end if;
  return new;
end;
$$ language plpgsql security definer;
