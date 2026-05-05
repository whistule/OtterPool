-- ============================================================
-- OtterPool — Profile detail fields + emergency contacts
-- ============================================================
-- Adds the personal/medical fields the profile screen needs and
-- introduces a separate emergency_contacts table (one row per ICE
-- contact, with primary flag). Spec §122 lists these as required at
-- first event signup; we don't enforce the gate yet — that's a
-- separate piece. Trip-window visibility for selkies/leaders is also
-- deferred: round one is self+admin only.

alter table public.profiles
  add column if not exists phone            text,
  add column if not exists dob              date,
  add column if not exists bc_membership_no text,
  add column if not exists medical_notes    text,
  add column if not exists photo_url        text;

create table if not exists public.emergency_contacts (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  relationship text,
  phone        text not null,
  email        text,
  address      text,
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_emergency_contacts_member
  on public.emergency_contacts (member_id);

-- At most one primary contact per member.
create unique index if not exists uniq_emergency_contacts_primary
  on public.emergency_contacts (member_id)
  where is_primary;

create trigger emergency_contacts_updated_at
  before update on public.emergency_contacts
  for each row execute function public.set_updated_at();

alter table public.emergency_contacts enable row level security;

create policy "Members manage own emergency contacts"
  on public.emergency_contacts for all
  to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy "Admins read all emergency contacts"
  on public.emergency_contacts for select
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );
