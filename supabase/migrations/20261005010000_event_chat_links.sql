-- ============================================================
-- OtterPool — per-trip WhatsApp group link
-- ============================================================
-- The leader makes the group in WhatsApp and pastes its invite link here; the
-- event page shows a "Join the trip WhatsApp" button. Anyone holding an invite
-- link can join the group, so it lives in its own table rather than on events
-- (which every member can read): only the leaders, paddling admins and
-- confirmed attendees can see it.

create table if not exists public.event_chat_links (
  event_id uuid primary key references public.events(id) on delete cascade,
  url text not null
    check (url ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]+(\?\S*)?$')
);

alter table public.event_chat_links enable row level security;

-- Leaders, assistant and paddling admins: the people who can edit the event.
drop policy if exists "Event editors manage chat links" on public.event_chat_links;
create policy "Event editors manage chat links"
  on public.event_chat_links for all
  to authenticated
  using (
    public.is_paddling_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_chat_links.event_id
        and (e.leader_id = (select auth.uid()) or e.assistant_id = (select auth.uid()))
    )
  )
  with check (
    public.is_paddling_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_chat_links.event_id
        and (e.leader_id = (select auth.uid()) or e.assistant_id = (select auth.uid()))
    )
  );

-- Confirmed attendees read it. Members can read their own sign-ups, so this
-- subquery sees the row it needs.
drop policy if exists "Confirmed attendees read chat links" on public.event_chat_links;
create policy "Confirmed attendees read chat links"
  on public.event_chat_links for select
  to authenticated
  using (
    exists (
      select 1 from public.event_signups s
      where s.event_id = event_chat_links.event_id
        and s.member_id = (select auth.uid())
        and s.status = 'confirmed'
    )
  );
