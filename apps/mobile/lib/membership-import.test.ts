// Run: npm run test:unit   (node's built-in runner, no framework)
//
// Guards the paste parsing for the membership import: two columns (email +
// expiry) in the messy shapes people actually paste out of MemberMojo.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseMemberDate, parseMemberPaste } from './membership-import.ts';

test('parseMemberDate: ISO, UK numeric, and spelled months', () => {
  assert.equal(parseMemberDate('2027-09-30'), '2027-09-30');
  assert.equal(parseMemberDate('30/09/2027'), '2027-09-30'); // UK: day first
  assert.equal(parseMemberDate('1-4-27'), '2027-04-01'); // 2-digit year → 20xx
  assert.equal(parseMemberDate('30.09.2027'), '2027-09-30');
  assert.equal(parseMemberDate('30 Sep 2027'), '2027-09-30');
  assert.equal(parseMemberDate('30 September 2027'), '2027-09-30');
});

test('parseMemberDate: rejects nonsense and impossible dates', () => {
  assert.equal(parseMemberDate(''), null);
  assert.equal(parseMemberDate('not a date'), null);
  assert.equal(parseMemberDate('31/02/2027'), null); // 31 Feb doesn't exist
  assert.equal(parseMemberDate('13/13/2027'), null);
});

test('parseMemberPaste: tab-separated two columns (MemberMojo copy)', () => {
  const { rows, withDate, noDate } = parseMemberPaste(
    'Alice@Example.com\t30/09/2027\nbob@example.com\t01/10/2027\n',
  );
  assert.deepEqual(rows, [
    { email: 'alice@example.com', expires: '2027-09-30' }, // lowercased
    { email: 'bob@example.com', expires: '2027-10-01' },
  ]);
  assert.equal(withDate, 2);
  assert.equal(noDate, 0);
});

test('parseMemberPaste: comma-separated and an email with no date', () => {
  const { rows, withDate, noDate } = parseMemberPaste(
    'carol@example.com,2027-10-01\ndave@example.com\n',
  );
  assert.deepEqual(rows, [
    { email: 'carol@example.com', expires: '2027-10-01' },
    { email: 'dave@example.com', expires: null },
  ]);
  assert.equal(withDate, 1);
  assert.equal(noDate, 1);
});

test('parseMemberPaste: drops non-email lines and blanks', () => {
  const { rows } = parseMemberPaste('Email\tRenewal\n\n   \nreal@example.com\t2027-10-01\n');
  // A header row ("Email"/"Renewal") has no @-token, so it's skipped.
  assert.deepEqual(rows, [{ email: 'real@example.com', expires: '2027-10-01' }]);
});

test('parseMemberPaste: duplicate email keeps the furthest expiry', () => {
  const { rows } = parseMemberPaste('sam@example.com\t01/10/2026\nsam@example.com\t30/09/2027\n');
  assert.deepEqual(rows, [{ email: 'sam@example.com', expires: '2027-09-30' }]);
});
