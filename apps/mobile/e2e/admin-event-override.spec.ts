import { expect, test, type Page } from '@playwright/test';

const PADDLING_ADMIN_EMAIL = process.env.E2E_PADDLING_ADMIN_EMAIL ?? 'e2e-paddling-admin@test.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-test-password';
const FIXTURE_EVENT_TITLE = 'E2E Manual Review Trip'; // owned by e2e-leader

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

test.describe('admin event override — paddling admin', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await signIn(page, PADDLING_ADMIN_EMAIL);
  });

  test('a non-leader paddling admin can edit another leader’s event', async ({ page }) => {
    await page.goto('/');
    await page.getByText(FIXTURE_EVENT_TITLE, { exact: true }).first().click();
    await page.waitForURL(/\/event\/[0-9a-f-]{36}/, { timeout: 15_000 });

    // The manage actions appear for a paddling admin even though they aren't
    // the leader.
    await page.locator('[data-testid="event-edit-cta"]:visible').click();
    await page.waitForURL(/\/event\/[0-9a-f-]{36}\/edit/, { timeout: 15_000 });

    const newLocation = `Overridden ${Date.now()}`;
    const loc = page.locator('input[placeholder^="e.g. Loch Lomond"]:visible');
    await loc.fill('');
    await loc.fill(newLocation);
    await page.locator('[data-testid="event-edit-submit"]:visible').click();

    await page.waitForURL(/\/event\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    await expect(page.getByText(newLocation).first()).toBeAttached({ timeout: 15_000 });
  });
});
