// Run: npm run test:money   (node's built-in runner, no framework)
//
// Pins the exact strings the UI shows. The bug this guards against shipped:
// `toFixed(0)` rendered a £0.50 trip as "£1" while Stripe charged 50p, so the
// label disagreed with the amount taken.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatCost, formatMoney, formatPence, parsePriceOptions } from './money.ts';

test('pence are never rounded away', () => {
  assert.equal(formatMoney(0.5), '£0.50');
  assert.equal(formatCost(0.5), '£0.50');
  assert.equal(formatMoney(12.34), '£12.34');
  // 2.5 is the case toFixed(0) got wrong in the other direction ("3").
  assert.equal(formatMoney(2.5), '£2.50');
});

test('whole pounds still show as money', () => {
  assert.equal(formatMoney(5), '£5.00');
  assert.equal(formatCost(5), '£5.00');
});

test('zero is Free only for formatCost', () => {
  assert.equal(formatCost(0), 'Free');
  assert.equal(formatMoney(0), '£0.00');
});

test('numeric columns arriving as strings are handled', () => {
  // supabase-js can hand back Postgres numeric as a string.
  assert.equal(formatMoney('0.50'), '£0.50');
  assert.equal(formatCost('0'), 'Free');
});

test('null and rubbish do not render NaN to a member', () => {
  assert.equal(formatCost(null), 'Free');
  assert.equal(formatCost(undefined), 'Free');
  assert.equal(formatMoney(null), '£0.00');
  assert.equal(formatMoney('not a number'), '£0.00');
});

test('formatPence renders whole pence as pounds', () => {
  // Price options store pence, so the £ shown must match Stripe's unit_amount.
  assert.equal(formatPence(1000), '£10.00');
  assert.equal(formatPence(500), '£5.00');
  assert.equal(formatPence(50), '£0.50');
  assert.equal(formatPence(0), '£0.00');
  assert.equal(formatPence(null), '£0.00');
  assert.equal(formatPence('not a number'), '£0.00');
});

test('parsePriceOptions keeps only well-formed {label, pence} entries', () => {
  assert.deepEqual(
    parsePriceOptions([
      { label: 'Adult', pence: 1000 },
      { label: 'Under 18', pence: 500 },
    ]),
    [
      { label: 'Adult', pence: 1000 },
      { label: 'Under 18', pence: 500 },
    ],
  );
  // The single-price case and any malformed data collapse to empty.
  assert.deepEqual(parsePriceOptions(null), []);
  assert.deepEqual(parsePriceOptions(undefined), []);
  assert.deepEqual(parsePriceOptions('nope'), []);
  // Drops entries missing a label or with a nonsense amount; rounds pence.
  assert.deepEqual(
    parsePriceOptions([
      { label: '', pence: 100 },
      { label: 'Ok', pence: 250.4 },
      { label: 'Bad', pence: 'x' },
      { pence: 100 },
    ]),
    [{ label: 'Ok', pence: 250 }],
  );
});
