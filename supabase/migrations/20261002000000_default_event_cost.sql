-- ============================================================
-- OtterPool — New events default to £5
-- ============================================================
-- The event form pre-fills cost from event_categories.default_cost. Raise every
-- category still at the seeded £0 to £5, except MicroSessions which stay free.
-- Rows already set to something else (Tuesday evenings, any hand-edited price)
-- are left alone.

update public.event_categories
set default_cost = 5
where default_cost = 0
  and name <> 'Skills Sessions / MicroSessions';

alter table public.event_categories
  alter column default_cost set default 5;
