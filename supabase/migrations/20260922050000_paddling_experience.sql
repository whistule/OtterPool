-- ============================================================
-- OtterPool — Self-declared paddling experience + level review
-- ============================================================
-- New joiners — especially experienced paddlers arriving from another
-- club — answer a short structured questionnaire about their paddling
-- background and request a level review. A paddling admin reads the
-- answers and sets the member's starting animal level from their profile.
--
-- Answers are stored as a jsonb map keyed by the question `key` defined in
-- apps/mobile/lib/experience.ts (e.g. {"years": "...", "boat": "..."}).
--
-- The answers are not sensitive like phone/dob/medical, but they are
-- personal and there is no reason for every member to read everyone
-- else's, so they live on member_private (self + super-admin RLS).
-- Paddling admins who are NOT super admins cannot read member_private
-- directly, so review access is via SECURITY DEFINER RPCs that expose
-- ONLY the experience fields — never phone, dob, bc number or medical.

alter table public.member_private
  add column if not exists experience_answers          jsonb,
  add column if not exists experience_review_requested boolean not null default false,
  add column if not exists experience_submitted_at     timestamptz,
  add column if not exists experience_reviewed_at       timestamptz;

-- Read one member's experience answers + review state. Paddling or super
-- admins only (the EXISTS guard returns zero rows otherwise). Returns only
-- the experience fields, so it never widens access to the sensitive columns.
create or replace function public.admin_member_experience(p_member_id uuid)
returns table (
  member_id                   uuid,
  experience_answers          jsonb,
  experience_review_requested boolean,
  experience_submitted_at     timestamptz,
  experience_reviewed_at      timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select mp.member_id, mp.experience_answers, mp.experience_review_requested,
         mp.experience_submitted_at, mp.experience_reviewed_at
  from public.member_private mp
  where mp.member_id = p_member_id
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and (p.is_admin or p.is_paddling_admin)
    );
$$;

revoke all on function public.admin_member_experience(uuid) from public, anon;
grant execute on function public.admin_member_experience(uuid) to authenticated;

-- List members who have requested a level review, newest request first.
-- Powers the "reviews pending" queue for paddling admins.
create or replace function public.admin_pending_experience()
returns table (
  id                      uuid,
  full_name               text,
  display_name            text,
  level                   text,
  experience_submitted_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.display_name, p.level::text, mp.experience_submitted_at
  from public.member_private mp
  join public.profiles p on p.id = mp.member_id
  where mp.experience_review_requested
    and exists (
      select 1 from public.profiles me
      where me.id = (select auth.uid()) and (me.is_admin or me.is_paddling_admin)
    )
  order by mp.experience_submitted_at desc nulls last;
$$;

revoke all on function public.admin_pending_experience() from public, anon;
grant execute on function public.admin_pending_experience() to authenticated;

-- Clear a member's review request once an admin has actioned it. Paddling
-- admins can't UPDATE member_private under RLS, so this runs as definer with
-- its own role guard. The WHERE clause keeps the safeupdate guard happy.
create or replace function public.admin_mark_experience_reviewed(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and (p.is_admin or p.is_paddling_admin)
  ) then
    raise exception 'not authorised';
  end if;
  update public.member_private
    set experience_review_requested = false,
        experience_reviewed_at = now()
    where member_id = p_member_id;
end;
$$;

revoke all on function public.admin_mark_experience_reviewed(uuid) from public, anon;
grant execute on function public.admin_mark_experience_reviewed(uuid) to authenticated;
