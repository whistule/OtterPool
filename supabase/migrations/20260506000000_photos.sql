-- ============================================================
-- OtterPool — Photos for events and profiles
-- ============================================================
--
-- Two public storage buckets:
--   - avatars       (path: <user_id>/<filename>)
--   - event-photos  (path: <event_id>/<filename>)
--
-- Public read so plain CDN URLs work; writes restricted to the
-- owning member / event leader.

alter table public.profiles
  add column if not exists avatar_path text;

alter table public.events
  add column if not exists photo_path text;

-- Recreate calendar_events to expose photo_path + leader avatar.
drop view if exists public.calendar_events;
create view public.calendar_events as
select
  e.id,
  e.title,
  c.name as category,
  e.grade_advertised,
  e.starts_at,
  e.ends_at,
  e.location,
  e.min_level,
  e.max_participants,
  e.cost,
  e.status,
  e.leader_id,
  e.photo_path,
  p.display_name as leader_name,
  p.avatar_path as leader_avatar_path,
  count(s.id) filter (where s.status = 'confirmed') as confirmed_count
from public.events e
join public.event_categories c on c.id = e.category_id
join public.profiles p on p.id = e.leader_id
left join public.event_signups s on s.event_id = e.id
where e.status in ('open', 'full')
group by e.id, c.name, p.display_name, p.avatar_path;

-- event_participants view needs avatar_path too.
create or replace view public.event_participants as
select
  s.id            as signup_id,
  s.event_id,
  s.member_id,
  s.signed_up_at,
  p.display_name,
  p.full_name,
  p.level,
  p.avatar_path
from public.event_signups s
join public.profiles p on p.id = s.member_id
where s.status = 'confirmed';

grant select on public.event_participants to authenticated;

-- Buckets (idempotent)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('event-photos', 'event-photos', true)
on conflict (id) do update set public = excluded.public;

-- ---------- avatars policies ----------
drop policy if exists "Avatars are publicly readable" on storage.objects;
create policy "Avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Members upload their own avatar" on storage.objects;
create policy "Members upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Members update their own avatar" on storage.objects;
create policy "Members update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Members delete their own avatar" on storage.objects;
create policy "Members delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------- event-photos policies ----------
drop policy if exists "Event photos are publicly readable" on storage.objects;
create policy "Event photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'event-photos');

-- A leader writes to <event_id>/... only for events they lead.
drop policy if exists "Leaders upload their event photo" on storage.objects;
create policy "Leaders upload their event photo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-photos'
    and exists (
      select 1 from public.events e
      where e.id::text = (storage.foldername(name))[1]
        and e.leader_id = auth.uid()
    )
  );

drop policy if exists "Leaders update their event photo" on storage.objects;
create policy "Leaders update their event photo"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'event-photos'
    and exists (
      select 1 from public.events e
      where e.id::text = (storage.foldername(name))[1]
        and e.leader_id = auth.uid()
    )
  );

drop policy if exists "Leaders delete their event photo" on storage.objects;
create policy "Leaders delete their event photo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'event-photos'
    and exists (
      select 1 from public.events e
      where e.id::text = (storage.foldername(name))[1]
        and e.leader_id = auth.uid()
    )
  );
