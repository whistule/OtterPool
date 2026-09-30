// Run: node --test supabase/assert-dev-project.test.js

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertDevProject } from './assert-dev-project.js';

test('allows the dev project and a local stack', () => {
  assertDevProject('https://fguutbhbzradrdyrxixg.supabase.co');
  assertDevProject('http://127.0.0.1:54321');
  assertDevProject('http://localhost:54321');
});

test('refuses production and lookalike hosts', () => {
  for (const url of [
    'https://cunkkdbfylimkktwgfle.supabase.co',
    'http://localhost.example.com',
    'https://example.com/127.0.0.1',
    undefined,
  ]) {
    assert.throws(() => assertDevProject(url), /Refusing to run/, String(url));
  }
});
