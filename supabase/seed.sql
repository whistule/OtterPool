-- ============================================================
-- OtterPool — Seed data (dummy profiles + events)
-- Run AFTER creating test users via Supabase Auth.
--
-- Replace the UUIDs below with real auth.users IDs from your
-- Supabase project, or run this after the on_auth_user_created
-- trigger has fired for each test account.
-- ============================================================

-- Step 1: Update the auto-created profiles with dummy data.
-- Create these users first via Supabase Auth (dashboard or API):
--   leader@test.com, member1@test.com, member2@test.com, member3@test.com

-- After creating them, grab their UUIDs and update below.
-- For now these are placeholder UUIDs — replace before running.

-- update public.profiles set
--   full_name = 'Keira MacIntyre',
--   display_name = 'Keira',
--   level = 'selkie',
--   status = 'active'
-- where id = '<leader-uuid>';

-- update public.profiles set
--   full_name = 'Jamie Reid',
--   display_name = 'Jamie',
--   level = 'dolphin',
--   status = 'active'
-- where id = '<member1-uuid>';

-- update public.profiles set
--   full_name = 'Siobhan Daly',
--   display_name = 'Siobhan',
--   level = 'duck',
--   status = 'active'
-- where id = '<member2-uuid>';

-- update public.profiles set
--   full_name = 'Chris Murray',
--   display_name = 'Chris',
--   level = 'frog',
--   status = 'aspirant'
-- where id = '<member3-uuid>';

-- Step 2: Sample events (leader_id must match a real profile)
-- Uncomment and fill UUIDs after creating test users.

-- insert into public.events (title, category_id, grade_advertised, starts_at, ends_at, location, meeting_point, min_level, max_participants, cost, status, leader_id) values
--   ('Tuesday Loch Lomond',        1,  null,    now() + interval '3 days',  now() + interval '3 days 3 hours', 'Loch Lomond, Balmaha',       'Balmaha car park',     'frog',  12, 5,  'open', '<leader-uuid>'),
--   ('Sea Kayak — Arran B Trip',   10, 'Sea B', now() + interval '10 days', now() + interval '10 days 5 hours','Arran, west coast',          'Lochranza ferry terminal','duck', 8,  15, 'open', '<leader-uuid>'),
--   ('Pinkston 2 Pumps',           5,  'P2',    now() + interval '5 days',  now() + interval '5 days 2 hours', 'Pinkston Watersports Centre','Pinkston reception',   'duck',  6,  0,  'open', '<leader-uuid>'),
--   ('River Tay — G2/3',           8,  'G2/3',  now() + interval '14 days', now() + interval '14 days 4 hours','River Tay, Grandtully',      'Grandtully car park',  'duck',  8,  10, 'open', '<leader-uuid>');
