// Run: node --test supabase/functions/_shared/grade-filter.test.ts

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { wantsGrade } from './grade-filter.ts';

const SEA = 1;
const RIVER = 2;

test('no filter for the category means every grade', () => {
  assert.equal(wantsGrade(null, SEA, 'Sea A'), true);
  assert.equal(wantsGrade({}, SEA, 'Sea A'), true);
  assert.equal(wantsGrade({ [SEA]: [] }, SEA, 'Sea A'), true);
  assert.equal(wantsGrade({ [RIVER]: ['G3'] }, SEA, 'Sea A'), true);
});

test('only the picked grades get through', () => {
  const f = { [SEA]: ['Sea C'] };
  assert.equal(wantsGrade(f, SEA, 'Sea C'), true);
  assert.equal(wantsGrade(f, SEA, 'Sea B'), false);
  assert.equal(wantsGrade(f, SEA, 'Sea A'), false);
});

test('an ungraded trip still notifies', () => {
  assert.equal(wantsGrade({ [SEA]: ['Sea C'] }, SEA, null), true);
});

test('a range trip matches any grade it spans', () => {
  const f = { [RIVER]: ['G3'] };
  assert.equal(wantsGrade(f, RIVER, 'G2/3'), true);
  assert.equal(wantsGrade(f, RIVER, 'G3(4)'), true);
  assert.equal(wantsGrade(f, RIVER, 'G1/2'), false);
  assert.equal(wantsGrade(f, RIVER, 'G4'), false);
  assert.equal(wantsGrade({ 3: ['P3'] }, 3, 'P1/2/3'), true);
});

test('a range left on does not pull in single grades switched off', () => {
  assert.equal(wantsGrade({ [RIVER]: ['G2/3', 'G3'] }, RIVER, 'G2'), false);
  assert.equal(wantsGrade({ [RIVER]: ['G2/3', 'G3'] }, RIVER, 'G2/3'), true);
});
