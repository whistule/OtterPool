-- ============================================================
-- OtterPool — let paddling admins create an event for another leader
-- ============================================================
-- "Leaders can create events" restricted every insert to
-- leader_id = auth.uid(). Broaden it so a Paddling/Super admin can
-- create an event on behalf of another leader; regular leaders are
-- still limited to creating events they lead.

drop policy if exists "Leaders can create events" on public.events;
create policy "Leaders can create events"
  on public.events for insert
  to authenticated
  with check (leader_id = auth.uid() or public.is_paddling_admin());
