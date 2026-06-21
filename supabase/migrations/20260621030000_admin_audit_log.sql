-- ============================================================
-- OtterPool — Admin action audit trail (stage 4/5)
-- ============================================================
-- Records sensitive admin actions. is_admin and status changes are
-- logged by a SECURITY DEFINER trigger on profiles so they can't be
-- skipped by a tampered client. Lower-risk actions (level, ceiling,
-- private-field edits) are logged best-effort from the client via the
-- "Admins write audit log" policy. Medical/PII values are never stored
-- in the log — only the fact that a change happened.

create table public.admin_audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  target_id   uuid,
  target_type text not null,            -- 'profile' | 'event' | 'signup'
  action      text not null,            -- 'is_admin' | 'status' | 'level' | 'ceiling' | ...
  before_val  text,
  after_val   text,
  created_at  timestamptz not null default now()
);

create index idx_admin_audit_created on public.admin_audit_log (created_at desc);
create index idx_admin_audit_target on public.admin_audit_log (target_id);

alter table public.admin_audit_log enable row level security;

create policy "Admins read audit log"
  on public.admin_audit_log for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- Client-logged actions must be self-attributed and by an admin.
create policy "Admins write audit log"
  on public.admin_audit_log for insert
  to authenticated
  with check (
    actor_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Tamper-resistant logging of the privilege-sensitive fields.
create or replace function public.log_profile_admin_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_admin is distinct from old.is_admin then
    insert into public.admin_audit_log (actor_id, target_id, target_type, action, before_val, after_val)
    values (auth.uid(), new.id, 'profile', 'is_admin', old.is_admin::text, new.is_admin::text);
  end if;
  if new.status is distinct from old.status then
    insert into public.admin_audit_log (actor_id, target_id, target_type, action, before_val, after_val)
    values (auth.uid(), new.id, 'profile', 'status', old.status::text, new.status::text);
  end if;
  return new;
end;
$$;

create trigger profiles_admin_audit
  after update on public.profiles
  for each row execute function public.log_profile_admin_audit();
