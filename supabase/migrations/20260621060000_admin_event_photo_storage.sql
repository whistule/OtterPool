-- ============================================================
-- OtterPool — Admin write access to event photos (storage)
-- ============================================================
-- The event-photos storage policies were leader-only (folder's event
-- led by auth.uid()), so the Stage 3 admin event-override couldn't
-- touch photos — admins could edit any event but not its image, and
-- the photo-reuse copy failed onto events they don't lead. Add
-- admin-aware policies (paddling/super admin) alongside the leader
-- ones. event-photos is already publicly readable, so SELECT is fine.

create policy "Admins upload event photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'event-photos' and public.is_paddling_admin());

create policy "Admins update event photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'event-photos' and public.is_paddling_admin())
  with check (bucket_id = 'event-photos' and public.is_paddling_admin());

create policy "Admins delete event photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'event-photos' and public.is_paddling_admin());
