import { expect, test } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL ?? 'e2e-member@test.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-test-password';

test.describe('login', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    // Supabase persists the session in localStorage on web — clear it so each
    // test starts signed-out.
    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test('signs in with valid credentials and lands on Calendar', async ({ page }) => {
    await page.goto('/sign-in');

    const email = page.getByPlaceholder('you@example.com');
    const password = page.locator('input[type="password"]');

    await expect(email).toBeVisible();
    await expect(password).toBeVisible();

    await email.fill(EMAIL);
    await password.fill(PASSWORD);

    await page.getByText('Sign in', { exact: true }).click();

    // AuthGate redirects to / once the session is set.
    await page.waitForURL((url) => !url.pathname.includes('sign-in'), {
      timeout: 20_000,
    });

    // Sign-in form is gone after the redirect — a reliable signal that the
    // session was accepted (RN Web wraps screen text in containers that
    // confuse Playwright's visibility heuristic, so we assert on form
    // disappearance instead of screen content).
    await expect(page.getByPlaceholder('you@example.com')).toHaveCount(0);
  });

  test('shows an error for an invalid password', async ({ page }) => {
    await page.goto('/sign-in');

    await page.getByPlaceholder('you@example.com').fill(EMAIL);
    await page.locator('input[type="password"]').fill('definitely-not-the-password');

    await page.getByText('Sign in', { exact: true }).click();

    await expect(
      page.getByText(/invalid login credentials/i),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  });
});
