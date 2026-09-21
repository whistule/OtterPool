-- ============================================================
-- OtterPool — Assistant (co-)leader on events
-- ============================================================
-- An optional second leader, set by the event's leader. The
-- assistant can EDIT the event but CANNOT review sign-ups — that
-- stays leader/admin only (no signup policy is granted here).

alter table public.events
  add column if not exists assistant_id uuid references public.profiles(id);

create index if not exists idx_events_assistant on public.events (assistant_id);

-- Assistant may update (edit) the event. Additive to "Leaders can update own
-- events"; permissive policies OR together. No with-check is given, so the
-- USING expression also guards the new row — an assistant can't drop themselves
-- as assistant via an update (only the leader reassigns it).
create policy "Assistants can update their events"
  on public.events for update
  to authenticated
  using (assistant_id = auth.uid());
