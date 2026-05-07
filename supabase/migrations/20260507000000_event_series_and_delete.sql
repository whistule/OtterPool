-- ============================================================
-- OtterPool — Repeating events + leader delete
-- ============================================================
-- Recurrence is stored as N independent event rows sharing a
-- series_id, so each occurrence keeps its own signups, capacity,
-- cost and status. Leaders can hard-delete their own events,
-- except when paid sign-ups exist (refund first).

alter table public.events
  add column if not exists series_id uuid;

create index if not exists idx_events_series on public.events (series_id);

create policy "Leaders can delete own events"
  on public.events for delete
  to authenticated
  using (leader_id = auth.uid());

create or replace function public.prevent_delete_paid_event()
returns trigger as $$
begin
  if exists (
    select 1 from public.event_signups
    where event_id = old.id and payment_status = 'paid'
  ) then
    raise exception 'Cannot delete event with paid sign-ups — refund first';
  end if;
  return old;
end;
$$ language plpgsql;

create trigger events_prevent_delete_paid
  before delete on public.events
  for each row execute function public.prevent_delete_paid_event();
