import { expect, test, type Page } from '@playwright/test';

const LEADER_EMAIL = process.env.E2E_LEADER_EMAIL ?? 'e2e-leader@test.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-test-password';
const POOL_LOCH_CATEGORY_ID = 7; // Pool / Loch Sessions — free, frog min level

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

async function startNewEvent(page: Page, title: string) {
  await page.locator('[data-testid="calendar-create-event"]:visible').click();
  await page.waitForURL(/\/event\/new/, { timeout: 15_000 });
  await page.locator('input[placeholder^="e.g. Sea Kayak"]:visible').fill(title);
  await page.locator(`[data-testid="category-chip-${POOL_LOCH_CATEGORY_ID}"]:visible`).click();
}

test.describe('event extras — leader', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await signIn(page, LEADER_EMAIL);
  });

  test('creates a multi-day event and shows a date range on the detail', async ({ page }) => {
    const title = `[E2E] Multiday ${Date.now()}`;
    await startNewEvent(page, title);

    // Switch to multi-day and set an explicit start + end on different days.
    await page.locator('[data-testid="event-multiday-on"]:visible').click();
    const dts = page.locator('input[type="datetime-local"]:visible');
    await dts.nth(0).fill('2027-03-15T10:00');
    await dts.nth(1).fill('2027-03-16T14:00');

    await page.locator('[data-testid="event-create-submit"]:visible').click();
    await page.waitForURL(/\/event\/[0-9a-f-]{36}/, { timeout: 15_000 });

    // formatRange renders cross-day spans with an arrow.
    await expect(page.getByText(title).first()).toBeAttached({ timeout: 15_000 });
    await expect(page.getByText('→').first()).toBeAttached({ timeout: 15_000 });
  });

  test('creates an event with two meet points and shows both on the detail', async ({ page }) => {
    const title = `[E2E] MeetPoints ${Date.now()}`;
    await startNewEvent(page, title);

    await page
      .locator('input[placeholder^="e.g. Club container"]:visible')
      .fill('Balloch container');
    await page.locator('input[placeholder="18:00"]:visible').fill('18:00');
    await page.locator('input[placeholder^="e.g. Loch Ard"]:visible').fill('Loch Ard hall');
    await page.locator('input[placeholder="18:45"]:visible').fill('18:45');

    await page.locator('[data-testid="event-create-submit"]:visible').click();
    await page.waitForURL(/\/event\/[0-9a-f-]{36}/, { timeout: 15_000 });

    await expect(page.getByText(/Collect gear at Balloch container.*18:00/).first()).toBeAttached({
      timeout: 15_000,
    });
    await expect(page.getByText(/Put in at Loch Ard hall.*18:45/).first()).toBeAttached({
      timeout: 15_000,
    });
  });
});
