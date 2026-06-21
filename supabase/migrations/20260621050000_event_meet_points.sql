-- ============================================================
-- OtterPool — Two meet points per event
-- ============================================================
-- Trips often have two rendezvous: a gear-collection meet and a boat
-- put-in, each at its own time. The existing meeting_point becomes the
-- gear-collection point; add a time for it plus a put-in point + time.
-- Times are time-of-day (not timestamps) so they apply to each date in
-- a repeating series.

alter table public.events
  add column if not exists meeting_time time,            -- gear collection time
  add column if not exists put_in_point text,            -- boat put-in location
  add column if not exists put_in_time  time;            -- boat put-in time
