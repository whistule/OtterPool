-- handle_new_user: pick up display_name / full_name from auth metadata so the
-- profiles row is populated at signup even when email confirmation defers the
-- session (and the client can't update profiles itself).

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, display_name)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), '')
  );
  return new;
end;
$$ language plpgsql security definer;
