// The event page renders "What to bring" as a tick-box kit list parsed by
// lib/kit-list.ts: a line ending ":" is a heading, "Note:" is small print.
// The event is inserted directly as the leader so the text is known; the
// checklist download itself (print dialog / popup) isn't followed.

import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const LEADER_EMAIL = process.env.E2E_LEADER_EMAIL ?? 'e2e-leader@test.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-test-password';
const POOL_LOCH_CATEGORY_ID = 7;

const KIT = [
  'Buoyancy aid',
  'Personal kit:',
  'Warm layers',
  'Spare clothes in a dry bag',
  'Note: no cotton next to the skin',
].join('\n');

async function signIn(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.goto('/sign-in');
  await page.getByPlaceholder('you@example.com').fill(LEADER_EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByText('Sign in', { exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes('sign-in'), { timeout: 20_000 });
}

test('event page shows the kit list in sections with a checklist download', async ({
  page,
  context,
}) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: LEADER_EMAIL,
    password: PASSWORD,
  });
  expect(authErr, 'leader sign-in should succeed').toBeNull();

  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 10);
  startsAt.setHours(19, 0, 0, 0);
  // "[E2E] " prefix: seed-e2e.js sweeps these up if the delete below is skipped.
  const { data: ev, error } = await supabase
    .from('events')
    .insert({
      title: `[E2E] Kit list ${Date.now()}`,
      category_id: POOL_LOCH_CATEGORY_ID,
      starts_at: startsAt.toISOString(),
      leader_id: auth.user!.id,
      min_level: 'frog',
      approval_mode: 'auto',
      status: 'open',
      what_to_bring: KIT,
    })
    .select('id')
    .single();
  expect(error, 'inserting the event should succeed').toBeNull();

  try {
    await context.clearCookies();
    await signIn(page);
    await page.goto(`/event/${ev!.id}`);

    await expect(page.getByText('What to bring').first()).toBeAttached({ timeout: 15_000 });
    for (const line of ['Buoyancy aid', 'Warm layers', 'Spare clothes in a dry bag']) {
      await expect(page.getByText(line, { exact: true }).first()).toBeAttached();
    }
    // Exact matches: the heading loses its colon, the note its "Note:" prefix.
    await expect(page.getByText('Personal kit', { exact: true }).first()).toBeAttached();
    await expect(
      page.getByText('no cotton next to the skin', { exact: true }).first(),
    ).toBeAttached();
    await expect(page.locator('[data-testid="event-kit-checklist"]:visible')).toBeVisible();
  } finally {
    await supabase.from('events').delete().eq('id', ev!.id);
  }
});
