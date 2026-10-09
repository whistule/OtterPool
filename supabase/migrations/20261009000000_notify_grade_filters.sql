-- Per-grade narrowing of new-trip alerts. Keyed by event_categories.id (as
-- text), each value an array of grade strings, e.g. {"3": ["Sea C"]}. A
-- category with no entry, or an empty array, means every grade — so existing
-- subscriptions carry on exactly as before. Only consulted for categories
-- already in notify_category_ids.

alter table public.profiles
  add column if not exists notify_grade_filters jsonb not null default '{}'::jsonb;
