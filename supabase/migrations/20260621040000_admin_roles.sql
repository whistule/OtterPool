-- ============================================================
-- OtterPool — Split admin into spec roles (stage 5/5)
-- ============================================================
-- Adds Membership Admin and Paddling Admin alongside the existing
-- is_admin flag, which is retained as "Super Admin" (implies every
-- role). All policies are additive: the existing is_admin policies
-- keep working for super admins; new role-scoped policies broaden
-- access to the relevant role.
--
--   Membership Admin → member accounts/data: email, status, private
--                      fields, emergency contacts.
--   Paddling Admin   → approval ceilings, animal level, event override
--                      and sign-up review.
--   Super Admin      → all of the above + granting roles + audit read.
--
-- Note: RLS is row-level, so a role admin's profiles-UPDATE policy
-- technically permits writing any non-guarded column; the UI scopes
-- which controls each role sees. The three role flags themselves are
-- protected by guard_profile_admin_flag (super admin only).

alter table public.profiles
  add column if not exists is_membership_admin boolean not null default false,
  add column if not exists is_paddling_admin   boolean not null default false;

-- ---------- role helper predicates (super admin implies each) ----------

create or replace function public.is_membership_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.is_admin or p.is_membership_admin)
  );
$$;

create or replace function public.is_paddling_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.is_admin or p.is_paddling_admin)
  );
$$;

revoke all on function public.is_membership_admin() from public, anon;
revoke all on function public.is_paddling_admin() from public, anon;
grant execute on function public.is_membership_admin() to authenticated;
grant execute on function public.is_paddling_admin() to authenticated;

-- ---------- only super admins may change any role flag ----------

create or replace function public.guard_profile_admin_flag()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.is_admin is distinct from old.is_admin
      or new.is_membership_admin is distinct from old.is_membership_admin
      or new.is_paddling_admin is distinct from old.is_paddling_admin)
     and not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'only super admins can change admin roles';
  end if;
  return new;
end;
$$;

-- ---------- audit role-flag changes too ----------

create or replace function public.log_profile_admin_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_admin is distinct from old.is_admin then
    insert into public.admin_audit_log (actor_id, target_id, target_type, action, before_val, after_val)
    values (auth.uid(), new.id, 'profile', 'is_admin', old.is_admin::text, new.is_admin::text);
  end if;
  if new.is_membership_admin is distinct from old.is_membership_admin then
    insert into public.admin_audit_log (actor_id, target_id, target_type, action, before_val, after_val)
    values (auth.uid(), new.id, 'profile', 'is_membership_admin', old.is_membership_admin::text, new.is_membership_admin::text);
  end if;
  if new.is_paddling_admin is distinct from old.is_paddling_admin then
    insert into public.admin_audit_log (actor_id, target_id, target_type, action, before_val, after_val)
    values (auth.uid(), new.id, 'profile', 'is_paddling_admin', old.is_paddling_admin::text, new.is_paddling_admin::text);
  end if;
  if new.status is distinct from old.status then
    insert into public.admin_audit_log (actor_id, target_id, target_type, action, before_val, after_val)
    values (auth.uid(), new.id, 'profile', 'status', old.status::text, new.status::text);
  end if;
  return new;
end;
$$;

-- ---------- emails: also visible to membership admins ----------

create or replace function public.admin_member_emails(p_member_id uuid default null)
returns table (id uuid, email text)
language sql security definer set search_path = '' as $$
  select u.id, u.email::text
  from auth.users u
  where exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and (p.is_admin or p.is_membership_admin)
  )
  and (p_member_id is null or u.id = p_member_id);
$$;

-- ---------- Membership Admin policies ----------

create policy "Role admins update profiles"
  on public.profiles for update to authenticated
  using (public.is_membership_admin() or public.is_paddling_admin())
  with check (public.is_membership_admin() or public.is_paddling_admin());

create policy "Membership admins read member private"
  on public.member_private for select to authenticated
  using (public.is_membership_admin());

create policy "Membership admins insert member private"
  on public.member_private for insert to authenticated
  with check (public.is_membership_admin());

create policy "Membership admins update member private"
  on public.member_private for update to authenticated
  using (public.is_membership_admin())
  with check (public.is_membership_admin());

create policy "Membership admins read emergency contacts"
  on public.emergency_contacts for select to authenticated
  using (public.is_membership_admin());

-- ---------- Paddling Admin policies ----------

create policy "Paddling admins manage approvals"
  on public.member_approvals for all to authenticated
  using (public.is_paddling_admin())
  with check (public.is_paddling_admin());

create policy "Paddling admins update events"
  on public.events for update to authenticated
  using (public.is_paddling_admin())
  with check (public.is_paddling_admin());

create policy "Paddling admins delete events"
  on public.events for delete to authenticated
  using (public.is_paddling_admin());

create policy "Paddling admins view signups"
  on public.event_signups for select to authenticated
  using (public.is_paddling_admin());

create policy "Paddling admins update signups"
  on public.event_signups for update to authenticated
  using (public.is_paddling_admin())
  with check (public.is_paddling_admin());

-- ---------- audit log readable/writable by any admin role ----------

create policy "Role admins read audit log"
  on public.admin_audit_log for select to authenticated
  using (public.is_membership_admin() or public.is_paddling_admin());

create policy "Role admins write audit log"
  on public.admin_audit_log for insert to authenticated
  with check (
    actor_id = auth.uid()
    and (public.is_membership_admin() or public.is_paddling_admin())
  );
