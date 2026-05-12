-- Trip-type notification subscriptions: per-profile array of category IDs the
-- member wants to be pushed about when new events are created. Default empty
-- (opt-in). Cancellation, payment, and review pushes are unaffected — those go
-- to people already involved with a specific event.

alter table public.profiles
  add column if not exists notify_category_ids int[] not null default '{}'::int[];

create index if not exists idx_profiles_notify_category_ids
  on public.profiles using gin (notify_category_ids);
