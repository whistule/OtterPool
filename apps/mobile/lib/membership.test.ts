// Run: npm run test:unit   (node's built-in runner, no framework)
//
// The status rule lives in two copies — the app's and the sign-up edge
// function's — so check both give the same answer for every case.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  memberStatus as edgeStatus,
  today as edgeToday,
} from '../../../supabase/functions/_shared/membership.ts';
import { emailKey, memberStatus, today } from './membership.ts';

const ON = '2026-09-30';

const cases = [
  { name: 'not on the list', override: null, listed: null, want: 'aspirant' },
  { name: 'on the list, no expiry', override: null, listed: { expires_on: null }, want: 'active' },
  { name: 'expires today', override: null, listed: { expires_on: ON }, want: 'active' },
  {
    name: 'expired yesterday',
    override: null,
    listed: { expires_on: '2026-09-29' },
    want: 'lapsed',
  },
  {
    name: 'suspended beats the list',
    override: 'suspended',
    listed: { expires_on: null },
    want: 'suspended',
  },
  {
    name: 'admin override for someone off the list',
    override: 'active',
    listed: null,
    want: 'active',
  },
  {
    name: 'admin lapses a listed member',
    override: 'lapsed',
    listed: { expires_on: null },
    want: 'lapsed',
  },
] as const;

for (const c of cases) {
  test(c.name, () => {
    assert.equal(memberStatus(c.override, c.listed, ON), c.want);
    assert.equal(edgeStatus(c.override, c.listed, ON), c.want);
  });
}

test('emailKey matches the lower(trim()) key the list is stored under', () => {
  assert.equal(emailKey('  Jo.Bloggs@Example.COM '), 'jo.bloggs@example.com');
  assert.equal(emailKey(null), '');
});

test('app and edge function agree on what day it is', () => {
  assert.equal(today(), edgeToday());
});
