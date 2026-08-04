// Run: node --test supabase/functions/_shared/capacity.test.ts
//
// Covers the two things that bit us: a held (pending_payment) seat counts
// against the cap, and the member holding it can still get back in to pay.
// Node runs this rather than Deno — the module's only remote import is
// type-only, so type stripping leaves nothing to resolve.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { confirmedCount, isAtCapacity } from './capacity.ts';

type Row = { member_id: string; status: string };

/** Minimal stand-in for the bits of the supabase client capacity.ts uses. */
function stubAdmin(rows: Row[]) {
  return {
    from: () => {
      let matched = rows;
      const q = {
        select: () => q,
        eq: () => q,
        in: (_col: string, values: string[]) => {
          matched = matched.filter((r) => values.includes(r.status));
          return q;
        },
        neq: (_col: string, value: string) => {
          matched = matched.filter((r) => r.member_id !== value);
          return q;
        },
        then: (resolve: (v: { count: number }) => void) => resolve({ count: matched.length }),
      };
      return q;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const seats: Row[] = [
  { member_id: 'a', status: 'confirmed' },
  { member_id: 'b', status: 'pending_payment' },
  { member_id: 'c', status: 'waitlisted' },
  { member_id: 'd', status: 'withdrawn' },
];

const capped = { id: 'e1', status: 'open', max_participants: 2 };

test('a held seat counts against the cap', async () => {
  assert.equal(await confirmedCount(stubAdmin(seats), 'e1'), 2);
});

test('the holder of a seat is not counted against themselves', async () => {
  assert.equal(await confirmedCount(stubAdmin(seats), 'e1', 'b'), 1);
});

test('two seats fill a two-seat event', async () => {
  assert.equal(await isAtCapacity(stubAdmin(seats), capped), true);
});

test('resuming your own checkout is not a full event', async () => {
  assert.equal(await isAtCapacity(stubAdmin(seats), capped, 'b'), false);
});

test("a 'full' capped event still lets its own holder pay", async () => {
  const full = { ...capped, status: 'full' };
  assert.equal(await isAtCapacity(stubAdmin(seats), full), true);
  assert.equal(await isAtCapacity(stubAdmin(seats), full, 'b'), false);
});

test("uncapped events honour a leader's 'full'", async () => {
  const uncapped = { id: 'e1', status: 'full', max_participants: null };
  assert.equal(await isAtCapacity(stubAdmin(seats), uncapped), true);
  assert.equal(await isAtCapacity(stubAdmin(seats), uncapped, 'b'), true);
  assert.equal(await isAtCapacity(stubAdmin(seats), { ...uncapped, status: 'open' }), false);
});
