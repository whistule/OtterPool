-- ============================================================
-- OtterPool — Leaders see their paddlers' paddling experience
-- ============================================================
-- A member below a trip's minimum level can now ask the leader to take them,
-- provided they've filled in the paddling-experience questionnaire (enforced
-- in the sign-up edge function). The request lands in the leader's review
-- queue as a pending_review sign-up, and the leader needs the answers to
-- decide — and to refer back to them afterwards, on the trip and from the
-- member's profile.
--
-- The answers live on member_private, which the leader can't read. Access is
-- via SECURITY DEFINER RPCs that expose ONLY the experience fields — never
-- phone, dob, bc number or medical — and only for members who have a sign-up
-- (any status) on an event the caller leads. Paddling and super admins keep
-- their existing access to everyone's.

-- Experience for everyone signed up to one event. Powers the review list.
create or replace function public.event_signup_experience(p_event_id uuid)
returns table (
  member_id              uuid,
  experience_answers     jsonb,
  experience_reviewed_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select mp.member_id, mp.experience_answers, mp.experience_reviewed_at
  from public.event_signups s
  join public.member_private mp on mp.member_id = s.member_id
  where s.event_id = p_event_id
    and exists (
      select 1 from public.events e
      where e.id = p_event_id
        and (
          e.leader_id = (select auth.uid())
          or exists (
            select 1 from public.profiles p
            where p.id = (select auth.uid()) and (p.is_admin or p.is_paddling_admin)
          )
        )
    );
$$;

revoke all on function public.event_signup_experience(uuid) from public, anon;
grant execute on function public.event_signup_experience(uuid) to authenticated;

-- One member's experience, for their profile page. Widened from
-- 20260922050000 so a leader can read it for anyone who has signed up to one
-- of their events. Return shape unchanged.
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
    and (
      exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid()) and (p.is_admin or p.is_paddling_admin)
      )
      or exists (
        select 1
        from public.event_signups s
        join public.events e on e.id = s.event_id
        where s.member_id = p_member_id
          and e.leader_id = (select auth.uid())
      )
    );
$$;

revoke all on function public.admin_member_experience(uuid) from public, anon;
grant execute on function public.admin_member_experience(uuid) to authenticated;
