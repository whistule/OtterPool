import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clockSkewRetryingFetch } from './clock-skew-fetch.ts';

const skew = () => new Response(JSON.stringify({ code: 'PGRST303' }), { status: 401 });
const denied = () => new Response(JSON.stringify({ code: '42501' }), { status: 401 });
const ok = () => new Response('[]', { status: 200 });

function scripted(...responses: (() => Response)[]) {
  const calls: RequestInit[] = [];
  const impl = (async (_input, init) => {
    calls.push(init ?? {});
    return (responses[calls.length - 1] ?? ok)();
  }) as typeof fetch;
  return { impl, calls };
}

test('a clock-skew rejection is retried until it clears', async () => {
  const { impl, calls } = scripted(skew, skew, ok);
  const res = await clockSkewRetryingFetch([0, 0], impl)('/rest/v1/profiles');
  assert.equal(res.status, 200);
  assert.equal(calls.length, 3);
});

test('retries are capped, and the last rejection is returned', async () => {
  const { impl, calls } = scripted(skew, skew, skew, ok);
  const res = await clockSkewRetryingFetch([0, 0], impl)('/rest/v1/profiles');
  assert.equal(res.status, 401);
  assert.equal(calls.length, 3);
});

test('a 401 that is not clock skew is passed straight through', async () => {
  const { impl, calls } = scripted(denied);
  const res = await clockSkewRetryingFetch([0, 0], impl)('/rest/v1/profiles');
  assert.equal(res.status, 401);
  assert.equal(calls.length, 1);
});

test('the body is still readable by the caller', async () => {
  const { impl } = scripted(denied);
  const res = await clockSkewRetryingFetch([0, 0], impl)('/rest/v1/profiles');
  assert.deepEqual(await res.json(), { code: '42501' });
});

test('a successful request is not retried', async () => {
  const { impl, calls } = scripted(ok);
  await clockSkewRetryingFetch([0, 0], impl)('/rest/v1/profiles');
  assert.equal(calls.length, 1);
});
