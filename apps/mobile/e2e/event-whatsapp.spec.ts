// The per-trip WhatsApp link: the leader pastes it in the edit form, and only
// confirmed attendees get it back. Visibility is RLS on event_chat_links, so
// the "not yet" check talks to PostgREST directly rather than trusting the UI.

import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const LEADER_EMAIL = process.env.E2E_LEADER_EMAIL ?? 'e2e-leader@test.com';
const MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL ?? 'e2e-member@test.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-test-password';
const POOL_LOCH_CATEGORY_ID = 7;
const INVITE = 'https://chat.whatsapp.com/E2eInviteCode123';

async function client(email: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  expect(error, `${email} sign-in should succeed`).toBeNull();
  return { supabase, userId: data.user!.id };
}

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.goto('/sign-in');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByText('Sign in', { exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes('sign-in'), { timeout: 20_000 });
}

test('only confirmed attendees see the trip WhatsApp link', async ({ page, context }) => {
  const leader = await client(LEADER_EMAIL);
  const member = await client(MEMBER_EMAIL);

  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 10);
  startsAt.setHours(19, 0, 0, 0);
  // "[E2E] " prefix: seed-e2e.js sweeps these up if the delete below is skipped.
  const { data: ev, error } = await leader.supabase
    .from('events')
    .insert({
      title: `[E2E] WhatsApp ${Date.now()}`,
      category_id: POOL_LOCH_CATEGORY_ID,
      starts_at: startsAt.toISOString(),
      leader_id: leader.userId,
      min_level: 'frog',
      approval_mode: 'auto',
      status: 'open',
      cost: 0,
    })
    .select('id')
    .single();
  expect(error, 'inserting the event should succeed').toBeNull();
  const eventId = ev!.id;

  try {
    // --- leader pastes the link in the edit form ---
    await context.clearCookies();
    await signIn(page, LEADER_EMAIL);
    await page.goto(`/event/${eventId}/edit`);
    await page.locator('[data-testid="event-whatsapp-help"]:visible').click();
    await expect(page.getByText('Copy link', { exact: false }).first()).toBeAttached();
    await page.locator('[data-testid="event-whatsapp-url"]:visible').fill(INVITE);
    await page.getByText('Save changes', { exact: true }).locator('visible=true').click();
    await page.waitForURL((url) => url.pathname === `/event/${eventId}`, { timeout: 15_000 });
    await expect(page.locator('[data-testid="event-whatsapp"]:visible')).toBeVisible({
      timeout: 15_000,
    });

    // --- not signed up yet: RLS hides it ---
    const before = await member.supabase
      .from('event_chat_links')
      .select('url')
      .eq('event_id', eventId);
    expect(before.error).toBeNull();
    expect(before.data, 'a non-attendee must not read the link').toEqual([]);

    // --- free auto-confirm event, so signing up confirms straight away ---
    const signup = await member.supabase.functions.invoke('sign-up', {
      body: { event_id: eventId },
    });
    expect(signup.error, 'member sign-up should succeed').toBeNull();

    const after = await member.supabase
      .from('event_chat_links')
      .select('url')
      .eq('event_id', eventId);
    expect(after.data).toEqual([{ url: INVITE }]);

    // --- and the confirmed member gets the button ---
    await context.clearCookies();
    await signIn(page, MEMBER_EMAIL);
    await page.goto(`/event/${eventId}`);
    await expect(page.locator('[data-testid="event-whatsapp"]:visible')).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await leader.supabase.from('events').delete().eq('id', eventId);
  }
});
