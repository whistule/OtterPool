-- ============================================================
-- OtterPool — take the Data API away from anon
-- ============================================================
-- Supabase's default privileges grant ALL on every new object in `public` to
-- anon and authenticated. For a TABLE that is harmless-ish, because RLS is what
-- actually protects it. For a VIEW there is no RLS underneath — the grant is
-- the whole of the access control, and our two member-facing views are
-- deliberately SECURITY DEFINER (see 20260829000000), so they read straight
-- past the RLS on the tables they aggregate.
--
-- The upshot, found by checking role_table_grants on production: anon — whose
-- key ships inside the web bundle — could SELECT from event_participants, i.e.
-- every member's full name, level, and which trips they are confirmed on,
-- without signing in. calendar_events was the same for the trip list.
--
-- The write privileges were inert (neither view is auto-updatable: one has a
-- GROUP BY, the other is a join), but they were never intended either, and a
-- later simplification of either view would have quietly made them real.
--
-- Nothing in this app talks to the Data API as anon: every policy is `to
-- authenticated`, and sign-in, sign-up and password recovery go through the
-- auth endpoints, not PostgREST. So revoke rather than patch the two views —
-- otherwise the next `drop view; create view` re-grants them, which is exactly
-- how calendar_events picked this up twice.
--
-- If a genuinely public page is ever wanted (an open trip calendar on the
-- website, say), grant SELECT to anon on that one view explicitly, in its own
-- migration, as a decision rather than a default.

-- Existing objects.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- Future ones. Without this, every new table and view starts out granted to
-- anon again and only RLS stands behind it — which a view does not have.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke all on functions from anon;

-- While here: narrow the two views to what they are actually for. Members read
-- them; nobody writes through them (and could not anyway).
revoke all on public.calendar_events from authenticated;
revoke all on public.event_participants from authenticated;
grant select on public.calendar_events to authenticated;
grant select on public.event_participants to authenticated;
