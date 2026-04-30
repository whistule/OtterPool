-- ============================================================
-- OtterPool — Public list of confirmed members per event
-- ============================================================

-- Members need to see who else is going on a trip without exposing the full
-- event_signups row (which holds payment fields and reviewer notes). This
-- view filters to confirmed seats and projects only the safe profile fields.
create or replace view public.event_participants as
select
  s.id            as signup_id,
  s.event_id,
  s.member_id,
  s.signed_up_at,
  p.display_name,
  p.full_name,
  p.level
from public.event_signups s
join public.profiles p on p.id = s.member_id
where s.status = 'confirmed';

grant select on public.event_participants to authenticated;
