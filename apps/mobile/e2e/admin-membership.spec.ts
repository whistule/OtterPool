import { expect, test, type Page } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_LEADER_EMAIL ?? 'e2e-leader@test.com'; // seeded is_admin
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

test.describe('admin — membership status', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await signIn(page, ADMIN_EMAIL);
  });

  test('admin changes another member’s status from their profile', async ({ page }) => {
    await page.goto('/members');
    // Open the seeded member's profile.
    await page.getByText('E2E Member', { exact: true }).first().click();
    await page.waitForURL(/\/profile\/[0-9a-f-]{36}/, { timeout: 15_000 });

    // The membership-status control is admin-only.
    await page.locator('[data-testid="change-status-cta"]:visible').click();
    await page.locator('[data-testid="status-pick-lapsed"]:visible').click();

    // The profile reflects the new status.
    await expect(page.getByText('lapsed').first()).toBeAttached({ timeout: 15_000 });

    // Restore the seeded status. The seed only runs once per suite, and
    // signup-review.spec.ts runs later against this same member — sign-up
    // rejects lapsed members, so leaving it set breaks that spec.
    await page.locator('[data-testid="change-status-cta"]:visible').click();
    await page.locator('[data-testid="status-pick-active"]:visible').click();

    await expect(page.getByText('is currently active').first()).toBeAttached({
      timeout: 15_000,
    });
  });

  test('super admin grants a member the membership-admin role', async ({ page }) => {
    await page.goto('/members');
    await page.getByText('E2E Member', { exact: true }).first().click();
    await page.waitForURL(/\/profile\/[0-9a-f-]{36}/, { timeout: 15_000 });

    // The Admin roles card is super-admin only. Assert on the button's own
    // label rather than a bare "On" pill: there are three role rows, so
    // getByText('On').first() passed whenever *any* role was enabled.
    const toggle = page.locator('[data-testid="toggle-role-is_membership_admin"]:visible');
    await expect(toggle).toHaveText(/Grant membership admin/, { timeout: 15_000 });
    await toggle.click();
    await expect(toggle).toHaveText(/Revoke membership admin/, { timeout: 15_000 });

    // Hand the fixture back. The suite runs serially against the shared hosted
    // project and only re-seeds in pretest:e2e, so a role left granted here
    // leaked into progress.spec.ts, which asserts the member sees no admin UI.
    // (Only is_admin has the tap-again-to-confirm step, so one tap revokes.)
    await toggle.click();
    await expect(toggle).toHaveText(/Grant membership admin/, { timeout: 15_000 });
  });
});
