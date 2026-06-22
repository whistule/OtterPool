-- ============================================================
-- OtterPool — Fuzzy photo suggestions via pg_trgm
-- ============================================================
-- Replaces the client-side ilike/word matching with trigram similarity
-- so typos and near-spellings still match, ranked best-first. Each
-- non-empty input term (title / put-in / location) is compared against
-- every event's title, location and put-in; the best score per photo
-- wins. SECURITY INVOKER — events are already readable by authenticated
-- via their own RLS, so no privilege escalation is needed.

create extension if not exists pg_trgm with schema extensions;

create or replace function public.suggest_event_photos(
  p_title text default '',
  p_put_in text default '',
  p_location text default ''
)
returns table (photo_path text)
language sql
stable
security invoker
set search_path = ''
as $$
  with terms as (
    select unnest(array_remove(array[
      nullif(trim(p_title), ''),
      nullif(trim(p_put_in), ''),
      nullif(trim(p_location), '')
    ], null)) as term
  ),
  scored as (
    select e.photo_path,
           max(greatest(
             extensions.similarity(coalesce(e.title, ''), t.term),
             extensions.similarity(coalesce(e.location, ''), t.term),
             extensions.similarity(coalesce(e.put_in_point, ''), t.term)
           )) as score,
           max(e.starts_at) as last_used
    from public.events e
    cross join terms t
    where e.photo_path is not null
    group by e.photo_path
  )
  select photo_path
  from scored
  where score >= 0.2
  order by score desc, last_used desc
  limit 8;
$$;

revoke all on function public.suggest_event_photos(text, text, text) from public, anon;
grant execute on function public.suggest_event_photos(text, text, text) to authenticated;

-- Trigram indexes keep similarity scans fast as the events table grows.
create index if not exists idx_events_title_trgm
  on public.events using gin (title extensions.gin_trgm_ops);
create index if not exists idx_events_location_trgm
  on public.events using gin (location extensions.gin_trgm_ops);
create index if not exists idx_events_put_in_trgm
  on public.events using gin (put_in_point extensions.gin_trgm_ops);
