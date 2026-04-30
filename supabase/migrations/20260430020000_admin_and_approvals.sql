-- ============================================================
-- OtterPool — Admin flag and per-track approval ceilings
-- ============================================================

-- Admin flag on profiles. Single flag for round one — spec distinguishes
-- Membership Admin / Paddling Admin / Super Admin but they collapse to
-- "can edit other members' progress" for now.
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Per-track approval ceiling. One row per (member, track). Cleared by
-- deleting the row. Audit history (who set what, when) lives in this row's
-- set_by / set_at — full chronological history is out of scope for v1.
create type public.approval_track as enum ('sea', 'river', 'pinkston');

create table public.member_approvals (
  member_id  uuid not null references public.profiles(id) on delete cascade,
  track      public.approval_track not null,
  ceiling    text not null,
  set_by     uuid references public.profiles(id),
  set_at     timestamptz not null default now(),
  primary key (member_id, track)
);

create index idx_member_approvals_member on public.member_approvals (member_id);

alter table public.member_approvals enable row level security;

-- Readable by all authenticated members (spec: ceilings appear in participant
-- lists; member sees own ceiling on their progress page).
create policy "Approval ceilings viewable by authenticated"
  on public.member_approvals for select
  to authenticated
  using (true);

-- Only admins write.
create policy "Admins manage approval ceilings"
  on public.member_approvals for all
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

-- Existing profile RLS allows self-update only. Add an admin override so
-- admins can change another member's level.
create policy "Admins can update any profile"
  on public.profiles for update
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

-- Block non-admins from flipping their own is_admin flag. RLS lets a member
-- update their own row freely, which would otherwise allow self-promotion.
create or replace function public.guard_profile_admin_flag()
returns trigger as $$
begin
  if new.is_admin is distinct from old.is_admin
     and not exists (
       select 1 from public.profiles where id = auth.uid() and is_admin
     ) then
    raise exception 'only admins can change is_admin';
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger profiles_guard_admin_flag
  before update on public.profiles
  for each row execute function public.guard_profile_admin_flag();

