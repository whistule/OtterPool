-- ============================================================
-- OtterPool — Lock down sensitive member fields (stage 2/5)
-- ============================================================
-- phone / dob / bc_membership_no / medical_notes lived on `profiles`,
-- whose SELECT policy is `using (true)` — so every authenticated
-- member could read them. Move them to a dedicated `member_private`
-- table readable/writable only by the member themselves and admins.
-- (Trip-window Selkie visibility remains deferred, as in the original
-- profile_fields migration.)

create table if not exists public.member_private (
  member_id        uuid primary key references public.profiles(id) on delete cascade,
  phone            text,
  dob              date,
  bc_membership_no text,
  medical_notes    text,
  updated_at       timestamptz not null default now()
);

-- Backfill from the existing columns before dropping them.
insert into public.member_private (member_id, phone, dob, bc_membership_no, medical_notes)
select id, phone, dob, bc_membership_no, medical_notes
from public.profiles
on conflict (member_id) do nothing;

alter table public.profiles
  drop column if exists phone,
  drop column if exists dob,
  drop column if exists bc_membership_no,
  drop column if exists medical_notes;

create trigger member_private_updated_at
  before update on public.member_private
  for each row execute function public.set_updated_at();

alter table public.member_private enable row level security;

-- Member manages their own row.
create policy "Members manage own private fields"
  on public.member_private for all
  to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

-- Admins read/write any row. Split per-action so admin upserts don't
-- collide with the combined self policy (see RLS upsert collision notes).
create policy "Admins read member private fields"
  on public.member_private for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create policy "Admins insert member private fields"
  on public.member_private for insert
  to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create policy "Admins update member private fields"
  on public.member_private for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
