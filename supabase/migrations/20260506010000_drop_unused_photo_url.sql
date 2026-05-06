-- Drop the unused photo_url columns. These were defined alongside the original
-- schemas but never read or written; the new photos work uses storage paths
-- (profiles.avatar_path, events.photo_path) resolved via getPublicUrl().

alter table public.profiles drop column if exists photo_url;
alter table public.events drop column if exists photo_url;
