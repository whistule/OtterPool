// Run: npm run test:unit   (node's built-in runner, no framework)
//
// Guards the paste parsing for the membership import: the real MemberMojo CSV
// export (header-driven, Active-only, must NOT mistake Date of birth for the
// expiry) and the simpler headerless two-column paste.
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

// A synthetic export shaped like MemberMojo's: the columns that matter (with
// Date of birth BEFORE Email, and Expires on / Membership state after), a
// quoted field containing a comma, and a Pending Payment row. All data is
// fake — no real member details belong in the repo.
const EXPORT_HEADER =
  'Membership,First name,Last name,Date of birth,Contact number,Email,Address line 1,Expires on,Membership state';

test('parseMemberPaste: reads the MemberMojo export by column, not position', () => {
  const csv = [
    EXPORT_HEADER,
    'Adult - Renewal,Ada,Test,1980-01-02,t:07000000001,ONE@example.com,"1 High Street, Anytown",2027-09-30,Active',
    'Junior - Renewal,Ben,Sample,2008-05-06,t:07000000002,two@example.com,"2 Low Road",2022-09-30,Pending Payment',
    'Concession - Renewal,Cara,Demo,1960-07-08,t:07000000003,three@example.com,3 Mid Lane,2027-09-30,Active',
  ].join('\n');

  const { rows, skippedInactive } = parseMemberPaste(csv);
  assert.deepEqual(rows, [
    // Expiry comes from "Expires on" (2027-09-30), NOT Date of birth (1980…).
    { email: 'one@example.com', expires: '2027-09-30' }, // lowercased
    { email: 'three@example.com', expires: '2027-09-30' },
  ]);
  // The Pending Payment row is dropped, not imported.
  assert.equal(skippedInactive, 1);
});

test('parseMemberPaste: tab-separated two columns (headerless copy)', () => {
  const { rows, withDate, noDate } = parseMemberPaste(
    'Alice@Example.com\t30/09/2027\nbob@example.com\t01/10/2027\n',
  );
  assert.deepEqual(rows, [
    { email: 'alice@example.com', expires: '2027-09-30' },
    { email: 'bob@example.com', expires: '2027-10-01' },
  ]);
  assert.equal(withDate, 2);
  assert.equal(noDate, 0);
});

test('parseMemberPaste: comma-separated headerless, and an email with no date', () => {
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

test('parseMemberPaste: duplicate email keeps the furthest expiry', () => {
  const { rows } = parseMemberPaste('sam@example.com\t01/10/2026\nsam@example.com\t30/09/2027\n');
  assert.deepEqual(rows, [{ email: 'sam@example.com', expires: '2027-09-30' }]);
});

test('parseMemberPaste: an export whose column is "Email address" still reads by header', () => {
  const { rows } = parseMemberPaste(
    'Name,Date of birth,Email address,Expires on,Membership state\n' +
      'Ann,01/02/1980,ann@example.com,30/09/2027,Active\n',
  );
  assert.deepEqual(rows, [{ email: 'ann@example.com', expires: '2027-09-30' }]);
});

test('parseMemberPaste: an unreadable export errors instead of grabbing date of birth', () => {
  const { rows, problem } = parseMemberPaste(
    'Name,Date of birth,Contact,Expires on,Membership state\n' +
      'Ann,01/02/1980,ann@example.com,30/09/2027,Active\n',
  );
  assert.deepEqual(rows, []);
  assert.match(problem ?? '', /email column/i);
});
