-- ============================================================
-- OtterPool — Membership status is computed, not stored
-- ============================================================
-- profiles.status was a copy of "is this member's email on the verified list,
-- and unexpired?", kept in step by reconcile_membership() at import and
-- claim_membership() from the client at sign-in. The copy kept going stale:
--   * a listed member saw the aspirant trial popup on first sign-in, because
--     the popup read status before the client's claim landed;
--   * expiry only took effect at the next import;
--   * an admin's status change was undone by the next import (the picker
--     never set membership_source = 'manual').
--
-- Now status is worked out in TypeScript wherever it is needed, from two
-- inputs (see memberStatus() in apps/mobile/lib/membership.ts and its mirror
-- in supabase/functions/_shared/membership.ts):
--   * profiles.status_override — an admin's decision, null = follow the list;
--   * the member's verified_members row, which RLS now lets the member read
--     (their own, matched on the JWT's email) and membership admins read and
--     write (all of it — the import is a plain upsert from the app).
-- The sign-up edge function reads both with the service role.
--
-- The list keeps history: the import upserts rather than replacing, so a
-- member who drops out of the export keeps their last expiry and reads as
-- 'lapsed'.

-- ---------- 1. the admin's decision ----------
alter table public.profiles add column status_override public.member_status;

-- Carry over only what a person decided: suspensions, and 'manual' rows the
-- reconcile was told to leave alone (pre-list profiles and email-mismatch
-- overrides). A 'list' row already follows the list, so it takes whatever the
-- list says now, which is what the next import would have done anyway (e.g.
-- an expired member still marked active becomes lapsed).
update public.profiles p
set status_override = p.status
from auth.users u
left join public.verified_members v on v.email_norm = lower(trim(u.email))
where u.id = p.id
  and (
    p.status = 'suspended'
    or (
      p.membership_source = 'manual'
      and p.status is distinct from (
        case
          when u.email_confirmed_at is null or v.email_norm is null then 'aspirant'
          when v.expires_on is null or v.expires_on >= current_date then 'active'
          else 'lapsed'
        end
      )::public.member_status
    )
  );

-- ---------- 2. who can read and write the list ----------
-- RLS was on with no policies (service role only). A member may see their own
-- row so the app can show their status and expiry; membership admins manage
-- the whole list. Nobody else sees anyone's email.
create policy "Members read their own verified row"
  on public.verified_members for select to authenticated
  using (email_norm = lower(trim(auth.jwt() ->> 'email')));

create policy "Membership admins manage the verified list"
  on public.verified_members for all to authenticated
  using (public.is_membership_admin())
  with check (public.is_membership_admin());

-- ---------- 3. the guard and the audit trail follow the override ----------
create or replace function public.guard_profile_admin_flag()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- auth.uid() is null for the service role (admin API, seeds). RLS keeps
  -- anon out of profiles entirely, so a null uid means the trusted backend.
  if auth.uid() is null then
    return new;
  end if;

  if (new.is_admin is distinct from old.is_admin
      or new.is_membership_admin is distinct from old.is_membership_admin
      or new.is_paddling_admin is distinct from old.is_paddling_admin)
     and not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'only super admins can change admin roles';
  end if;

  if new.level is distinct from old.level and not public.is_paddling_admin() then
    raise exception 'only paddling admins can change a member level';
  end if;

  if new.status_override is distinct from old.status_override
     and not public.is_membership_admin() then
    raise exception 'only membership admins can change a member status';
  end if;

  return new;
end;
$$;

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
  if new.status_override is distinct from old.status_override then
    insert into public.admin_audit_log (actor_id, target_id, target_type, action, before_val, after_val)
    values (auth.uid(), new.id, 'profile', 'status_override', old.status_override::text, new.status_override::text);
  end if;
  return new;
end;
$$;

-- ---------- 4. drop the sync machinery ----------
drop function public.reconcile_membership();
drop function public.claim_membership();
drop function public.import_verified_members(jsonb);
drop function public.my_membership();
alter table public.profiles drop column membership_source;
alter table public.profiles drop column status;
