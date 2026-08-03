-- ============================================================
-- OtterPool — Fix my_trip_tally after the category unification
-- ============================================================
-- 20260507100000_unify_grade_categories.sql collapsed
--   'Sea Kayak - A/B/C Trip' -> 'Sea Kayak'
--   'Pinkston - 1/2/3 Pump(s)' -> 'Pinkston'
-- and moved the grade to events.grade_advertised, but this view kept
-- matching the old names. Every sea trip fell through to the bucket
-- 'Sea Kayak' and every pump session to 'Pinkston', so the grade
-- breakdown on My Trips was empty and tallyTotals() — which matches
-- buckets against SEA_GRADES/PINKSTON_GRADES — reported zero sea and
-- zero pinkston trips on the Progress screen.
--
-- Read the grade off the event, the way the River branch already did.
-- The unify migration backfilled grade_advertised for historic rows, so
-- past trips bucket correctly too.

create or replace view public.my_trip_tally as
select
  bucket,
  count(*)::int as count
from (
  select
    case
      when c.name = 'Sea Kayak'
        then coalesce(e.grade_actual, e.grade_advertised, 'Sea')
      when c.name = 'River Trip'
        then coalesce(e.grade_actual, e.grade_advertised, 'River')
      when c.name = 'Pinkston'
        then coalesce(e.grade_actual, e.grade_advertised, 'Pinkston')
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
