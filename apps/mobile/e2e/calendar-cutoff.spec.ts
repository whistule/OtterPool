import { expect, test, type Page } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL ?? 'e2e-member@test.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-test-password';

// Seeded by supabase/seed-e2e.js relative to the reseed time.
const UNDER_WAY = '[E2E] Under Way Multi-day'; // started yesterday, ends tomorrow
const STARTED_NO_END = '[E2E] Started No End'; // started 2h ago, no end time
const STALE_NO_END = '[E2E] Stale No End'; // started 7h ago, no end time
const JUST_FINISHED = '[E2E] Just Finished'; // ended 1h ago
const LONG_FINISHED = '[E2E] Long Finished'; // ended 7h ago

async function signIn(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.goto('/sign-in');
  await page.getByPlaceholder('you@example.com').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByText('Sign in', { exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes('sign-in'), {
    timeout: 20_000,
  });
}

const card = (page: Page, title: string) =>
  page.locator('[data-testid^="calendar-event-"]:visible').filter({ hasText: title });

const pad2 = (n: number) => String(n).padStart(2, '0');
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

test.describe('calendar cutoff', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await signIn(page);
    await expect(card(page, UNDER_WAY)).toHaveCount(1, { timeout: 15_000 });
  });

  test('keeps events until 6h after they end, or after start with no end', async ({ page }) => {
    await expect(card(page, STARTED_NO_END)).toHaveCount(1);
    await expect(card(page, STALE_NO_END)).toHaveCount(0);
    await expect(card(page, JUST_FINISHED)).toHaveCount(1);
    await expect(card(page, LONG_FINISHED)).toHaveCount(0);
  });

  test('marks events already under way "On now"', async ({ page }) => {
    await expect(card(page, UNDER_WAY)).toContainText('On now');
    await expect(card(page, JUST_FINISHED)).not.toContainText('On now');
    await expect(card(page, 'E2E Manual Review Trip')).not.toContainText('On now');
  });

  test('a multi-day trip under way shows under today in the date strip', async ({ page }) => {
    await page.locator(`[data-testid="date-strip-${todayKey()}"]:visible`).click();
    await expect(card(page, UNDER_WAY)).toHaveCount(1);
    await expect(card(page, STARTED_NO_END)).toHaveCount(1);
    await expect(card(page, 'E2E Manual Review Trip')).toHaveCount(0);
  });
});
