/**
 * Creates test users and seeds their profiles.
 *
 * Usage:
 *   cp config.js config.local.js   # fill in your values
 *   node setup-test-users.js
 *
 * Requires the SERVICE ROLE key (not the anon key).
 * Get it from: Supabase Dashboard → Settings → API → service_role
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './config.secret.js';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_USERS = [
  {
    email: 'keira@test.com',
    password: 'testtest',
    full_name: 'Keira MacIntyre',
    display_name: 'Keira',
    level: 'selkie',
    status: 'active',
  },
  {
    email: 'jamie@test.com',
    password: 'testtest',
    full_name: 'Jamie Reid',
    display_name: 'Jamie',
    level: 'dolphin',
    status: 'active',
  },
  {
    email: 'siobhan@test.com',
    password: 'testtest',
    full_name: 'Siobhan Daly',
    display_name: 'Siobhan',
    level: 'duck',
    status: 'active',
  },
  {
    email: 'chris@test.com',
    password: 'testtest',
    full_name: 'Chris Murray',
    display_name: 'Chris',
    level: 'frog',
    status: 'aspirant',
  },
];

async function main() {
  console.log('Creating test users...\n');

  const createdUsers = [];

  for (const u of TEST_USERS) {
    // Check if user already exists
    const { data: existing } = await admin.auth.admin.listUsers();
    const found = existing?.users?.find((x) => x.email === u.email);

    if (found) {
      console.log(`  ✓ ${u.email} already exists (${found.id})`);
      createdUsers.push({ ...u, id: found.id });
      continue;
    }

    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true, // skip email verification for test users
    });

    if (error) {
      console.error(`  ✗ ${u.email}: ${error.message}`);
      continue;
    }

    console.log(`  + ${u.email} created (${data.user.id})`);
    createdUsers.push({ ...u, id: data.user.id });
  }

  console.log('\nUpdating profiles...\n');

  for (const u of createdUsers) {
    const { error } = await admin
      .from('profiles')
      .update({
        full_name: u.full_name,
        display_name: u.display_name,
        level: u.level,
        status: u.status,
      })
      .eq('id', u.id);

    if (error) {
      console.error(`  ✗ ${u.email}: ${error.message}`);
    } else {
      console.log(`  ✓ ${u.display_name} — ${u.level} (${u.status})`);
    }
  }

  // Create a sample event led by Keira (the Selkie)
  const keira = createdUsers.find((u) => u.email === 'keira@test.com');
  if (keira) {
    console.log('\nCreating sample events...\n');

    const events = [
      {
        title: 'Tuesday Loch Lomond',
        category_id: 1,
        grade_advertised: null,
        starts_at: futureDate(3),
        ends_at: futureDate(3, 3),
        location: 'Loch Lomond, Balmaha',
        meeting_point: 'Balmaha car park',
        min_level: 'frog',
        max_participants: 12,
        cost: 5,
        status: 'open',
        leader_id: keira.id,
      },
      {
        title: 'Sea Kayak — Arran B Trip',
        category_id: 10,
        grade_advertised: 'Sea B',
        starts_at: futureDate(10),
        ends_at: futureDate(10, 5),
        location: 'Arran, west coast',
        meeting_point: 'Lochranza ferry terminal',
        min_level: 'duck',
        max_participants: 8,
        cost: 15,
        status: 'open',
        leader_id: keira.id,
      },
      {
        title: 'Pinkston 2 Pumps',
        category_id: 5,
        grade_advertised: 'P2',
        starts_at: futureDate(5),
        ends_at: futureDate(5, 2),
        location: 'Pinkston Watersports Centre',
        meeting_point: 'Pinkston reception',
        min_level: 'duck',
        max_participants: 6,
        cost: 0,
        status: 'open',
        leader_id: keira.id,
      },
      {
        title: 'River Tay — G2/3',
        category_id: 8,
        grade_advertised: 'G2/3',
        starts_at: futureDate(14),
        ends_at: futureDate(14, 4),
        location: 'River Tay, Grandtully',
        meeting_point: 'Grandtully car park',
        min_level: 'duck',
        max_participants: 8,
        cost: 10,
        status: 'open',
        leader_id: keira.id,
      },
      {
        title: 'Pool Session — Beginners Welcome',
        category_id: 7,
        grade_advertised: null,
        starts_at: futureDate(2),
        ends_at: futureDate(2, 1.5),
        location: 'Drumchapel Pool',
        meeting_point: 'Pool reception',
        min_level: 'frog',
        max_participants: 10,
        cost: 0,
        status: 'open',
        approval_mode: 'manual_all',
        leader_id: keira.id,
      },
    ];

    for (const evt of events) {
      const { error } = await admin.from('events').insert(evt);
      if (error) {
        console.error(`  ✗ ${evt.title}: ${error.message}`);
      } else {
        console.log(`  + ${evt.title}`);
      }
    }
  }

  console.log('\n--- Done! ---\n');
  console.log('Test accounts (all passwords: testtest):');
  for (const u of createdUsers) {
    console.log(`  ${u.email.padEnd(20)} ${u.level.padEnd(8)} ${u.status}`);
  }
  console.log();
}

function futureDate(daysFromNow, extraHours = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(10 + extraHours, 0, 0, 0);
  return d.toISOString();
}

main();
