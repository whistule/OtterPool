/**
 * E2E test fixtures.
 *
 * Idempotent — safe to run multiple times. Each run:
 *   1. Ensures e2e-leader and e2e-member users exist (creates if missing).
 *   2. Resets their profile state to known values.
 *   3. Recreates the fixture event ("E2E Manual Review Trip") owned by
 *      e2e-leader, with approval_mode = manual_all.
 *   4. Clears any existing signups for the fixture event so each test run
 *      starts from a clean approval queue.
 *
 * Usage:
 *   node supabase/seed-e2e.js
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in supabase/config.secret.js.
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './config.secret.js';
import { assertDevProject } from './assert-dev-project.js';

// Destructive + service-role: never let this touch production.
assertDevProject(SUPABASE_URL);

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const FIXTURE_EVENT_TITLE = 'E2E Manual Review Trip';
const FIXTURE_SELKIE_TITLE = 'E2E Selkie Only Trip';
const FIXTURE_PHOTO_TITLE = 'E2E Photo Source Trip';
const FIXTURE_PUT_IN = 'E2E Put In Spot';

const E2E_USERS = [
  {
    email: 'e2e-leader@test.com',
    password: 'e2e-test-password',
    full_name: 'E2E Leader',
    display_name: 'E2E Leader',
    level: 'selkie',
    status: 'active',
    is_admin: true,
  },
  {
    email: 'e2e-member@test.com',
    password: 'e2e-test-password',
    full_name: 'E2E Member',
    display_name: 'E2E Member',
    level: 'duck',
    status: 'active',
    is_admin: false,
  },
  {
    email: 'e2e-membership-admin@test.com',
    password: 'e2e-test-password',
    full_name: 'E2E Membership Admin',
    display_name: 'E2E Membership Admin',
    level: 'duck',
    status: 'active',
    is_membership_admin: true,
  },
  {
    email: 'e2e-paddling-admin@test.com',
    password: 'e2e-test-password',
    full_name: 'E2E Paddling Admin',
    display_name: 'E2E Paddling Admin',
    level: 'duck',
    status: 'active',
    is_paddling_admin: true,
  },
  // A leader with no admin flags, so specs can prove a plain leader's access
  // rather than riding on e2e-leader's is_admin.
  {
    email: 'e2e-trip-leader@test.com',
    password: 'e2e-test-password',
    full_name: 'E2E Trip Leader',
    display_name: 'E2E Trip Leader',
    level: 'selkie',
    status: 'active',
  },
];

async function ensureUser(spec) {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) {
    throw listErr;
  }

  let user = list.users.find((u) => u.email === spec.email);

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: spec.email,
      password: spec.password,
      email_confirm: true,
    });
    if (error) {
      throw error;
    }
    user = data.user;
    console.log(`  + created ${spec.email}`);
  } else {
    console.log(`  · ${spec.email} exists (${user.id})`);
  }

  const { error: updErr } = await admin
    .from('profiles')
    .update({
      full_name: spec.full_name,
      display_name: spec.display_name,
      level: spec.level,
      // Fixture users aren't on the verified-members list, so pin their status.
      status_override: spec.status,
      is_admin: spec.is_admin ?? false,
      is_membership_admin: spec.is_membership_admin ?? false,
      is_paddling_admin: spec.is_paddling_admin ?? false,
      avatar_path: null,
    })
    .eq('id', user.id);
  if (updErr) {
    throw updErr;
  }

  // Sensitive fields now live in member_private — clear them for a known
  // empty baseline (Stage 2 moved them off profiles).
  const { error: mpErr } = await admin.from('member_private').delete().eq('member_id', user.id);
  if (mpErr) {
    throw mpErr;
  }

  return { ...spec, id: user.id };
}

async function resetFixtureEvent(leader, tripLeader) {
  // Drop any prior fixture events by title — keeps history clean and means
  // we don't accumulate stale rows across runs.
  const { error: delErr } = await admin
    .from('events')
    .delete()
    .in('title', [FIXTURE_EVENT_TITLE, FIXTURE_SELKIE_TITLE, FIXTURE_PHOTO_TITLE]);
  if (delErr) {
    throw delErr;
  }

  // Clear any leftover events the create-event spec made on previous runs.
  // The spec prefixes its title with "[E2E]" so they're easy to find.
  const { error: prefixErr } = await admin.from('events').delete().like('title', '[E2E] %');
  if (prefixErr) {
    throw prefixErr;
  }

  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 14);
  startsAt.setHours(10, 0, 0, 0);
  const endsAt = new Date(startsAt);
  endsAt.setHours(13, 0, 0, 0);

  const { data, error } = await admin
    .from('events')
    .insert({
      title: FIXTURE_EVENT_TITLE,
      category_id: 7, // Pool / Loch Sessions — free, frog min level
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      location: 'E2E test pool',
      meeting_point: 'Reception',
      min_level: 'frog',
      max_participants: 6,
      cost: 0,
      status: 'open',
      approval_mode: 'manual_all',
      leader_id: leader.id,
    })
    .select('id')
    .single();
  if (error) {
    throw error;
  }

  // Selkie-only fixture used by the calendar-filter spec to verify that
  // "Open to me" hides events the signed-in member can't attend. Led by the
  // non-admin trip leader for the below-level spec.
  const selkieStartsAt = new Date(startsAt);
  selkieStartsAt.setDate(selkieStartsAt.getDate() + 1);
  const selkieEndsAt = new Date(selkieStartsAt);
  selkieEndsAt.setHours(selkieStartsAt.getHours() + 3);

  const { error: selkieErr } = await admin.from('events').insert({
    title: FIXTURE_SELKIE_TITLE,
    category_id: 7,
    starts_at: selkieStartsAt.toISOString(),
    ends_at: selkieEndsAt.toISOString(),
    location: 'E2E selkie only',
    meeting_point: 'Reception',
    min_level: 'selkie',
    max_participants: 6,
    cost: 0,
    status: 'open',
    approval_mode: 'auto',
    leader_id: tripLeader.id,
  });
  if (selkieErr) {
    throw selkieErr;
  }

  // A past event carrying a photo + distinctive put-in, used by the
  // photo-suggestions spec. Past so it doesn't show in the upcoming calendar
  // (won't disturb calendar-filter), but still queryable as a suggestion.
  const photoStartsAt = new Date(startsAt);
  photoStartsAt.setDate(photoStartsAt.getDate() - 60);
  const photoEndsAt = new Date(photoStartsAt);
  photoEndsAt.setHours(photoStartsAt.getHours() + 3);
  const { error: photoErr } = await admin.from('events').insert({
    title: FIXTURE_PHOTO_TITLE,
    category_id: 7,
    starts_at: photoStartsAt.toISOString(),
    ends_at: photoEndsAt.toISOString(),
    location: 'E2E photo source',
    put_in_point: FIXTURE_PUT_IN,
    photo_path: 'fixture/e2e-photo-source.jpg',
    min_level: 'frog',
    max_participants: 6,
    cost: 0,
    status: 'open',
    approval_mode: 'auto',
    leader_id: leader.id,
  });
  if (photoErr) {
    throw photoErr;
  }

  // Calendar cutoff fixtures, timed relative to now (pretest:e2e reseeds
  // before every run). The '[E2E] ' prefix gets them cleared above.
  const hoursFromNow = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(10, 0, 0, 0);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(16, 0, 0, 0);
  const timingFixtures = [
    ['[E2E] Under Way Multi-day', yesterday.toISOString(), tomorrow.toISOString()],
    ['[E2E] Started No End', hoursFromNow(-2), null],
    ['[E2E] Stale No End', hoursFromNow(-7), null],
    ['[E2E] Just Finished', hoursFromNow(-3), hoursFromNow(-1)],
    ['[E2E] Long Finished', hoursFromNow(-10), hoursFromNow(-7)],
  ];
  const { error: timingErr } = await admin.from('events').insert(
    timingFixtures.map(([title, starts_at, ends_at]) => ({
      title,
      category_id: 7,
      starts_at,
      ends_at,
      location: 'E2E timing',
      meeting_point: 'Reception',
      min_level: 'frog',
      max_participants: 6,
      cost: 0,
      status: 'open',
      approval_mode: 'auto',
      leader_id: leader.id,
    })),
  );
  if (timingErr) {
    throw timingErr;
  }

  console.log(`  + fixture event ${FIXTURE_EVENT_TITLE} (${data.id})`);
  console.log(`  + fixture event ${FIXTURE_SELKIE_TITLE}`);
  console.log(`  + fixture event ${FIXTURE_PHOTO_TITLE}`);
  return data.id;
}

async function clearSignups(eventId, memberIds) {
  const { error } = await admin
    .from('event_signups')
    .delete()
    .eq('event_id', eventId)
    .in('member_id', memberIds);
  if (error) {
    throw error;
  }
  console.log(`  · cleared signups for ${memberIds.length} member(s)`);
}

async function clearApprovals(memberIds) {
  const { error } = await admin.from('member_approvals').delete().in('member_id', memberIds);
  if (error) {
    throw error;
  }
  console.log(`  · cleared approval ceilings for ${memberIds.length} member(s)`);
}

async function main() {
  console.log('Seeding e2e fixtures...\n');

  const users = [];
  for (const spec of E2E_USERS) {
    users.push(await ensureUser(spec));
  }

  const leader = users.find((u) => u.email === 'e2e-leader@test.com');
  if (!leader) {
    throw new Error('e2e-leader user missing after seed');
  }

  const tripLeader = users.find((u) => u.email === 'e2e-trip-leader@test.com');
  if (!tripLeader) {
    throw new Error('e2e-trip-leader user missing after seed');
  }

  const eventId = await resetFixtureEvent(leader, tripLeader);
  const memberIds = users.map((u) => u.id);
  await clearSignups(eventId, memberIds);
  await clearApprovals(memberIds);

  console.log('\n--- e2e fixtures ready ---');
  console.log(`  fixture event id: ${eventId}`);
  for (const u of users) {
    console.log(`  ${u.email.padEnd(22)} ${u.id}`);
  }
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
