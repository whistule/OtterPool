-- ============================================================
-- OtterPool — experience RPCs use the shared role predicate again
-- ============================================================
-- 20260927000000 (section 7) replaced the inlined `is_admin or
-- is_paddling_admin` in these RPCs with public.is_paddling_admin(), so the
-- rule is written once. 20261002010000 widened admin_member_experience for
-- leaders and copied the inline check back in, and event_signup_experience
-- was written the same way. Same behaviour, one definition.

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
    and (
      public.is_paddling_admin()
      or exists (
        select 1 from public.events e
        where e.id = p_event_id
          and e.leader_id = (select auth.uid())
      )
    );
$$;

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
      public.is_paddling_admin()
      or exists (
        select 1
        from public.event_signups s
        join public.events e on e.id = s.event_id
        where s.member_id = p_member_id
          and e.leader_id = (select auth.uid())
      )
    );
$$;
