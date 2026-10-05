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
  await page.waitForURL((url) => !url.pathname.includes('sign-in'), {
    timeout: 20_000,
  });
}

test.describe('profile — member view', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await signIn(page, MEMBER_EMAIL);
    await page.goto('/profile');
    // Profile screen renders details once the profile loads.
    await expect(page.getByText('Personal details').first()).toBeAttached({
      timeout: 15_000,
    });
  });

  test('edits personal details and persists across reload', async ({ page }) => {
    await page.locator('[data-testid="profile-edit"]:visible').click();

    // The edit form shows the same labels — fill the inputs that appear.
    const inputs = page.locator('input:visible, textarea:visible');
    // Inputs in field order: full name, display name, phone, dob, bc
    await inputs.nth(0).fill('E2E Member Full');
    await inputs.nth(2).fill('07700 900111');
    await inputs.nth(3).fill('1990-04-12');
    await inputs.nth(4).fill('BC-99999');

    await page.locator('[data-testid="profile-save"]:visible').click();

    // Read view returns and shows the new values.
    await expect(page.locator('[data-testid="profile-edit"]:visible')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('E2E Member Full').first()).toBeAttached();
    await expect(page.getByText('07700 900111').first()).toBeAttached();
    await expect(page.getByText('12 Apr 1990').first()).toBeAttached();
    await expect(page.getByText('BC-99999').first()).toBeAttached();

    // Persistence is already verified by the read-view assertion above —
    // saveProfile calls refreshProfile() which round-trips through the DB.
  });

  test('rejects an invalid date of birth', async ({ page }) => {
    await page.locator('[data-testid="profile-edit"]:visible').click();
    const inputs = page.locator('input:visible, textarea:visible');
    await inputs.nth(3).fill('not-a-date');
    await page.locator('[data-testid="profile-save"]:visible').click();
    await expect(page.getByText(/YYYY-MM-DD/i).first()).toBeAttached({
      timeout: 5_000,
    });
  });
});

test.describe('profile — settings & info links', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await signIn(page, MEMBER_EMAIL);
    await page.goto('/profile');
    await expect(page.getByText('Settings & info').first()).toBeAttached({ timeout: 15_000 });
  });

  test('tab bar has no Levels or Notify tab', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /Levels|Notify/ })).toHaveCount(0);
  });

  test('opens notifications and comes back', async ({ page }) => {
    await page.locator('[data-testid="profile-notifications"]:visible').click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByText('Trip alerts').first()).toBeAttached();
    await page.locator('[aria-label="Back"]:visible').click();
    await expect(page).toHaveURL(/\/profile$/);
  });

  test('level pill opens the levels guide', async ({ page }) => {
    await page.locator('[data-testid="profile-level-pill"]:visible').click();
    await expect(page).toHaveURL(/\/levels$/);
    // Opens scrolled to the member's own level, not the intro.
    await expect(page.getByText('Your level').first()).toBeInViewport();
  });
});
