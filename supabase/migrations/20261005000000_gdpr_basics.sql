-- ============================================================
-- OtterPool — GDPR basics
-- ============================================================
-- 1. Stop holding medical details and emergency contacts. The club
--    collects them on paper at the waterside (docs/MVP.md), and medical
--    data is special category data we'd otherwise need explicit consent
--    and stronger protection for. Dropping them deletes what is held.
--
-- 2. Make a member deletable on request (docs/data-deletion.md). These
--    references had no ON DELETE rule, so deleting anyone who had ever
--    reviewed a sign-up, set an approval or assisted on a trip failed.
--    events.leader_id stays NOT NULL: reassign their events first.

drop table if exists public.emergency_contacts;

alter table public.member_private
  drop column if exists medical_notes;

alter table public.event_signups
  drop constraint event_signups_reviewed_by_fkey,
  add constraint event_signups_reviewed_by_fkey
    foreign key (reviewed_by) references public.profiles(id) on delete set null;

alter table public.member_approvals
  drop constraint member_approvals_set_by_fkey,
  add constraint member_approvals_set_by_fkey
    foreign key (set_by) references public.profiles(id) on delete set null;

alter table public.events
  drop constraint events_assistant_id_fkey,
  add constraint events_assistant_id_fkey
    foreign key (assistant_id) references public.profiles(id) on delete set null;
