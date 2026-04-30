import { expect, test, type Page } from '@playwright/test';

const MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL ?? 'e2e-member@test.com';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'e2e-leader@test.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-test-password';

const MEMBER_DISPLAY = 'E2E Member';

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

test.describe('progress — member view', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await signIn(page, MEMBER_EMAIL);
  });

  test('shows the member’s level, all ceilings unset, and no admin CTA', async ({
    page,
  }) => {
    await page.goto('/progress');

    // Duck level rendered (member is seeded as duck).
    await expect(page.getByText('Duck', { exact: true }).first()).toBeAttached({
      timeout: 15_000,
    });
    await expect(
      page.getByText('Capsize drill complete').first(),
    ).toBeAttached();

    // Each track row shows "Not set" before any ceiling exists.
    for (const track of ['sea', 'river', 'pinkston']) {
      const row = page.locator(`[data-testid="ceiling-row-${track}"]:visible`);
      await expect(row).toContainText('Not set');
    }

    // Members area is admin-only.
    await expect(
      page.locator('[data-testid="admin-manage-members"]:visible'),
    ).toHaveCount(0);
  });
});

test.describe('progress — admin view', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await signIn(page, ADMIN_EMAIL);
  });

  test('admin lands on Progress and reaches the Members list', async ({ page }) => {
    await page.goto('/progress');

    const cta = page.locator('[data-testid="admin-manage-members"]:visible');
    await expect(cta).toBeVisible();
    await cta.click();

    // Members list shows the seeded test member.
    await expect(page.getByText(MEMBER_DISPLAY).first()).toBeAttached({
      timeout: 15_000,
    });
  });

  test('admin changes a member’s animal level', async ({ page }) => {
    await page.goto('/members');
    await page.getByText(MEMBER_DISPLAY).first().click();

    // Initial state: header pill shows the duck label.
    await expect(page.getByText('🦆 Duck').first()).toBeAttached({
      timeout: 15_000,
    });

    await page.locator('[data-testid="change-level-cta"]:visible').click();
    await page.locator('[data-testid="level-pick-otter"]:visible').click();

    // Header pill updates to otter once the save round-trips.
    await expect(page.getByText('🦦 Otter').first()).toBeAttached({
      timeout: 15_000,
    });
  });

  test('admin sets and clears a per-track approval ceiling', async ({ page }) => {
    await page.goto('/members');
    await page.getByText(MEMBER_DISPLAY).first().click();

    const seaRow = page.locator('[data-testid="ceiling-row-sea"]:visible');
    await expect(seaRow).toContainText('Not set');

    await seaRow.click();
    await page.locator('[data-testid="ceiling-pick-Sea B"]:visible').click();

    await expect(seaRow).toContainText('Up to Sea B', { timeout: 15_000 });

    // Clear via the picker's "Clear ceiling" option.
    await seaRow.click();
    await page.locator('[data-testid="ceiling-pick-clear"]:visible').click();
    await expect(seaRow).toContainText('Not set', { timeout: 15_000 });
  });
});
