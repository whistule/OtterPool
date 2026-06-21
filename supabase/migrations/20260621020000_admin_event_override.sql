-- ============================================================
-- OtterPool — Admin override on events (stage 3/5)
-- ============================================================
-- Events and their sign-ups were manageable only by the event's
-- leader (leader_id = auth.uid()). Add admin-override policies so
-- admins can edit/cancel/delete any event and review its sign-ups.
-- RLS permissive policies are OR'd, so these sit alongside the
-- existing leader policies without replacing them. The
-- prevent_delete_paid_event trigger still guards deletes for everyone.

create policy "Admins can update any event"
  on public.events for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create policy "Admins can delete any event"
  on public.events for delete
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create policy "Admins can view all signups"
  on public.event_signups for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create policy "Admins can update any signup"
  on public.event_signups for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
