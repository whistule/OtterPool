import { expect, test, type Page } from '@playwright/test';

const LEADER_EMAIL = process.env.E2E_LEADER_EMAIL ?? 'e2e-leader@test.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-test-password';
const POOL_LOCH_CATEGORY_ID = 7; // matches the seed migration

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

test.describe('event create — leader', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await signIn(page, LEADER_EMAIL);
  });

  test('creates a new event from the calendar FAB and lands on its detail page', async ({
    page,
  }) => {
    // The seed-e2e script removes any "[E2E] %" titled events on each run, so
    // a fresh suffix avoids collisions across re-runs within a single seed.
    const title = `[E2E] Created ${Date.now()}`;

    // signIn already lands on the calendar; an extra goto('/') after a fresh
    // login races AuthGate's session resolve and locks the page on a spinner.
    await page.locator('[data-testid="calendar-create-event"]:visible').click();
    await page.waitForURL(/\/event\/new/, { timeout: 15_000 });

    await page.locator('input[placeholder^="e.g. Sea Kayak"]:visible').fill(title);

    await page.locator(`[data-testid="category-chip-${POOL_LOCH_CATEGORY_ID}"]:visible`).click();

    await page.locator('input[placeholder^="e.g. Loch Lomond"]:visible').fill('Pinkston');
    await page.locator('input[placeholder^="e.g. Balmaha"]:visible').fill('Reception');

    await page.locator('[data-testid="event-create-submit"]:visible').click();

    // Insert returns to /event/<id>; check the title renders on the detail.
    await page.waitForURL(/\/event\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await expect(page.getByText(title).first()).toBeAttached({ timeout: 15_000 });

    // And it's discoverable from the calendar.
    await page.goto('/');
    await expect(page.getByText(title).first()).toBeAttached({ timeout: 15_000 });
  });
});
