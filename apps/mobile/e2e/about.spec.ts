import { expect, test, type Page } from '@playwright/test';

const MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL ?? 'e2e-member@test.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-test-password';

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

test.describe('about', () => {
  test('reachable from Profile and shows what the club needs', async ({ page, context }) => {
    await context.clearCookies();
    await signIn(page, MEMBER_EMAIL);

    await page.goto('/profile');
    await page.locator('[data-testid="profile-about"]:visible').click();
    await page.waitForURL(/\/about/, { timeout: 15_000 });

    // Scope to the visible screen — expo-router keeps the profile tab mounted.
    const about = page.locator('[data-testid="about-source-link"]:visible');
    await expect(about).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText('Drumchapel and Clydebank Kayak Club').first()).toBeAttached();
    // The ladder is rendered from lib/progress, so a missing level here means
    // the shared source of truth changed shape.
    for (const level of ['Frog', 'Duck', 'Otter', 'Dolphin', 'Selkie']) {
      await expect(page.getByText(level, { exact: true }).first()).toBeAttached();
    }
    await expect(page.getByText(/never reach OtterPool or the club/).first()).toBeAttached();
  });
});
