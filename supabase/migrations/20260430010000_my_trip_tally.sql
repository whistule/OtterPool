-- ============================================================
-- OtterPool — Per-member experience tally
-- ============================================================

-- Aggregates the calling member's confirmed past trips into discipline/grade
-- buckets for the "Experience tally" section on My Trips. Filters by
-- auth.uid() so the view always returns the caller's own counts.
create or replace view public.my_trip_tally as
select
  bucket,
  count(*)::int as count
from (
  select
    case
      when c.name = 'Sea Kayak - A Trip' then 'Sea A'
      when c.name = 'Sea Kayak - B Trip' then 'Sea B'
      when c.name = 'Sea Kayak - C Trip' then 'Sea C'
      when c.name = 'River Trip'
        then coalesce(e.grade_actual, e.grade_advertised, 'River')
      when c.name = 'Pinkston - 1 Pump'  then 'P1'
      when c.name = 'Pinkston - 2 Pumps' then 'P2'
      when c.name = 'Pinkston - 3 Pumps' then 'P3'
      when c.name like 'Tuesday Evening%' then 'Tuesday'
      when c.name = 'Pool / Loch Sessions' then 'Loch'
      when c.name = 'Night Paddle' then 'Night'
      when c.name = 'Second Saturday Paddle' then '2nd Sat'
      when c.name like 'Skills%' then 'Skills'
      when c.name like 'Training%' then 'Training'
      else c.name
    end as bucket
  from public.event_signups s
  join public.events e             on e.id = s.event_id
  join public.event_categories c   on c.id = e.category_id
  where s.member_id = auth.uid()
    and s.status = 'confirmed'
    and coalesce(e.ends_at, e.starts_at) < now()
) sub
group by bucket;

grant select on public.my_trip_tally to authenticated;
