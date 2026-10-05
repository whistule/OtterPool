// Editing one event in a repeating series: only the fields the leader changed
// are copied to the other events, and only to the ones they pick. An event
// with its own tweak (here, a different location) keeps it.
//
// The series is inserted directly as the leader rather than through the
// create wizard, so each test starts from a known set of rows.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const LEADER_EMAIL = process.env.E2E_LEADER_EMAIL ?? 'e2e-leader@test.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-test-password';
const POOL_LOCH_CATEGORY_ID = 7;

type Row = { id: string; starts_at: string; cost: number; location: string | null };

async function leaderClient() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: LEADER_EMAIL,
    password: PASSWORD,
  });
  expect(error, 'leader sign-in should succeed').toBeNull();
  return { supabase, userId: data.user!.id };
}

// Three weekly events starting next week, £5 at Pinkston, except the third
// which the leader already moved to Loch Lomond on its own.
async function seedSeries(supabase: SupabaseClient, userId: string, title: string) {
  const seriesId = crypto.randomUUID();
  const first = new Date();
  first.setDate(first.getDate() + 7);
  first.setHours(19, 0, 0, 0);
  const rows = [0, 1, 2].map((i) => {
    const starts = new Date(first);
    starts.setDate(starts.getDate() + i * 7);
    return {
      title,
      category_id: POOL_LOCH_CATEGORY_ID,
      starts_at: starts.toISOString(),
      leader_id: userId,
      min_level: 'duck',
      approval_mode: 'auto',
      status: 'open',
      cost: 5,
      location: i === 2 ? 'Loch Lomond' : 'Pinkston',
      series_id: seriesId,
    };
  });
  const { data, error } = await supabase
    .from('events')
    .insert(rows)
    .select('id, starts_at, cost, location')
    .order('starts_at', { ascending: true });
  expect(error, 'seeding the series should succeed').toBeNull();
  return { seriesId, rows: data as Row[] };
}

async function readSeries(supabase: SupabaseClient, seriesId: string) {
  const { data } = await supabase
    .from('events')
    .select('id, starts_at, cost, location')
    .eq('series_id', seriesId)
    .order('starts_at', { ascending: true });
  return (data ?? []) as Row[];
}

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

// Open the middle event's edit screen, change only the price and save.
async function changeMiddlePrice(page: Page, eventId: string) {
  await page.goto(`/event/${eventId}/edit`);
  const cost = page.locator('[data-testid="event-cost"]:visible');
  await expect(cost).toHaveValue('5', { timeout: 15_000 });
  await cost.fill('7');
  await page.locator('[data-testid="event-edit-submit"]:visible').click();
  await expect(page.getByText('You changed price.').first()).toBeAttached({ timeout: 5_000 });
}

test.describe('repeating event edit — leader', () => {
  let supabase: SupabaseClient;
  let seriesId: string;
  let rows: Row[];

  test.beforeEach(async ({ page, context }) => {
    const leader = await leaderClient();
    supabase = leader.supabase;
    ({ seriesId, rows } = await seedSeries(
      supabase,
      leader.userId,
      `[E2E] Series edit ${Date.now()}`,
    ));
    await context.clearCookies();
    await signIn(page);
  });

  test.afterEach(async () => {
    await supabase.from('events').delete().eq('series_id', seriesId);
  });

  test('"this and following" copies only the price, from this event on', async ({ page }) => {
    await changeMiddlePrice(page, rows[1].id);
    await page.locator('[data-testid="series-scope-following"]:visible').click();
    await page.waitForURL(new RegExp(`/event/${rows[1].id}$`), { timeout: 15_000 });

    const after = await readSeries(supabase, seriesId);
    expect(after.map((r) => Number(r.cost))).toEqual([5, 7, 7]);
    // The third event's own location survived the series write.
    expect(after.map((r) => r.location)).toEqual(['Pinkston', 'Pinkston', 'Loch Lomond']);
  });

  test('"all events" includes earlier ones, still only the price', async ({ page }) => {
    await changeMiddlePrice(page, rows[1].id);
    await page.locator('[data-testid="series-scope-all"]:visible').click();
    await page.waitForURL(new RegExp(`/event/${rows[1].id}$`), { timeout: 15_000 });

    const after = await readSeries(supabase, seriesId);
    expect(after.map((r) => Number(r.cost))).toEqual([7, 7, 7]);
    expect(after.map((r) => r.location)).toEqual(['Pinkston', 'Pinkston', 'Loch Lomond']);
  });

  test('"this event only" leaves the rest alone', async ({ page }) => {
    await changeMiddlePrice(page, rows[1].id);
    await page.locator('[data-testid="series-scope-single"]:visible').click();
    await page.waitForURL(new RegExp(`/event/${rows[1].id}$`), { timeout: 15_000 });

    const after = await readSeries(supabase, seriesId);
    expect(after.map((r) => Number(r.cost))).toEqual([5, 7, 5]);
  });
});
