// Run: node --test supabase/functions/_shared/pricing.test.ts

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mayCharge, resolveCharge } from './pricing.ts';

const tiered = {
  cost: 0,
  price_options: [
    { label: 'Member', pence: 0 },
    { label: 'Guest', pence: 500 },
  ],
};

test('a chosen tier is charged at its stored amount', () => {
  assert.deepEqual(resolveCharge(tiered, 1), { pence: 500, label: 'Guest' });
});

test('a missing, out-of-range or non-integer choice falls back to tier 0', () => {
  for (const choice of [undefined, 2, -1, 0.5, '1']) {
    assert.equal(resolveCharge(tiered, choice).pence, 0, String(choice));
  }
});

test('flat cost is pounds, charged in pence', () => {
  assert.equal(resolveCharge({ cost: '0.50', price_options: null }, 0).pence, 50);
});

test('a free standard tier does not make a tiered event free', () => {
  assert.equal(mayCharge(tiered), true);
});

test('free is free', () => {
  assert.equal(mayCharge({ cost: 0, price_options: null }), false);
  assert.equal(mayCharge({ cost: 0, price_options: [{ label: 'All', pence: 0 }] }), false);
  assert.equal(mayCharge({ cost: 10, price_options: null }), true);
});
