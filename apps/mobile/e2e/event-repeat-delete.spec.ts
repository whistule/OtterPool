import { expect, test, type Page } from '@playwright/test';

const LEADER_EMAIL = process.env.E2E_LEADER_EMAIL ?? 'e2e-leader@test.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-test-password';
const POOL_LOCH_CATEGORY_ID = 7;

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
  await page.waitForURL((url) => !url.pathname.includes('sign-in'), {
    timeout: 20_000,
  });
}

async function fillBaseEvent(page: Page, title: string) {
  await page.locator('[data-testid="calendar-create-event"]:visible').click();
  await page.waitForURL(/\/event\/new/, { timeout: 15_000 });
  await page.locator('input[placeholder^="e.g. Sea Kayak"]:visible').fill(title);
  await page
    .locator(`[data-testid="category-chip-${POOL_LOCH_CATEGORY_ID}"]:visible`)
    .click();
  await page.locator('input[placeholder^="e.g. Loch Lomond"]:visible').fill('Pinkston');
  await page.locator('input[placeholder^="e.g. Balmaha"]:visible').fill('Reception');
}

test.describe('event recurrence + delete — leader', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await signIn(page, LEADER_EMAIL);
  });

  test('creates a repeating event and produces multiple calendar occurrences', async ({
    page,
  }) => {
    const title = `[E2E] Repeats ${Date.now()}`;
    await fillBaseEvent(page, title);

    await page.locator('[data-testid="event-repeat-on"]:visible').click();
    await page.locator('[data-testid="event-repeat-weekly"]:visible').click();
    await page.locator('[data-testid="event-repeat-count"]:visible').fill('3');

    await page.locator('[data-testid="event-create-submit"]:visible').click();
    await page.waitForURL(/\/event\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await expect(page.getByText(title).first()).toBeAttached({ timeout: 15_000 });

    await page.goto('/');
    // Three independent events with the same title should now be on the calendar.
    await expect.poll(
      async () => page.getByText(title).count(),
      { timeout: 15_000 },
    ).toBeGreaterThanOrEqual(3);
  });

  test('leader can delete an event from the edit screen', async ({ page }) => {
    const title = `[E2E] DeleteMe ${Date.now()}`;
    await fillBaseEvent(page, title);
    await page.locator('[data-testid="event-create-submit"]:visible').click();
    await page.waitForURL(/\/event\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const eventUrl = page.url();
    const eventId = eventUrl.match(/\/event\/([0-9a-f-]{36})/)?.[1];
    expect(eventId).toBeTruthy();

    await page.locator('[data-testid="event-edit-cta"]:visible').click();
    await page.waitForURL(/\/event\/[0-9a-f-]{36}\/edit/, { timeout: 15_000 });

    // Two-tap confirm: first tap arms, second tap deletes.
    await page.locator('[data-testid="event-delete"]:visible').click();
    await expect(
      page.getByText('Tap again to confirm delete').first(),
    ).toBeAttached({ timeout: 5_000 });
    await page.locator('[data-testid="event-delete"]:visible').click();

    // Should land back on the calendar (root) and the title should be gone.
    await page.waitForURL((url) => url.pathname === '/' || url.pathname === '', {
      timeout: 15_000,
    });
    await expect.poll(
      async () => page.getByText(title).count(),
      { timeout: 15_000 },
    ).toBe(0);

    // Direct nav to the detail page should now report not found.
    await page.goto(`/event/${eventId}`);
    await expect(page.getByText('Event not found').first()).toBeAttached({
      timeout: 15_000,
    });
  });
});
