import { expect, test, type Page } from '@playwright/test';

const MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL ?? 'e2e-member@test.com';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'e2e-leader@test.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-test-password';

const MEMBER_DISPLAY = 'E2E Member';
const LEADER_DISPLAY = 'E2E Leader';

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

// Member rows on /members are testID-prefixed; filtering by hasText scopes
// to a specific row regardless of where else the name might be rendered
// (e.g. the calendar tab is still mounted under expo-router).
function memberRow(page: Page, displayName: string) {
  return page.locator('[data-testid^="member-row-"]:visible').filter({ hasText: displayName });
}

test.describe('members list — admin', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await signIn(page, ADMIN_EMAIL);
  });

  test('search filters the members list', async ({ page }) => {
    await page.goto('/members');
    await expect(memberRow(page, MEMBER_DISPLAY)).toHaveCount(1, { timeout: 15_000 });
    await expect(memberRow(page, LEADER_DISPLAY)).toHaveCount(1);

    await page.locator('input[placeholder="Search members"]:visible').fill('Member');
    await expect(memberRow(page, MEMBER_DISPLAY)).toHaveCount(1);
    await expect(memberRow(page, LEADER_DISPLAY)).toHaveCount(0);

    await page.locator('input[placeholder="Search members"]:visible').fill('xyznoresult');
    await expect(page.getByText('No matches').first()).toBeAttached({ timeout: 5_000 });
  });
});

test.describe('member profile view — non-admin', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await signIn(page, MEMBER_EMAIL);
  });

  test('a member visiting another profile sees no admin edit controls', async ({ page }) => {
    // Members can reach /members directly even though the admin tile is the
    // only UI link to it. From there, click into the leader's profile.
    await page.goto('/members');
    const leaderRow = memberRow(page, LEADER_DISPLAY);
    await expect(leaderRow).toHaveCount(1, { timeout: 15_000 });
    await leaderRow.click();

    // Profile detail loads — Selkie pill confirms we're on the right person.
    await expect(page.getByText('🦭 Selkie').first()).toBeAttached({ timeout: 15_000 });

    // No admin CTAs.
    await expect(page.locator('[data-testid="change-level-cta"]')).toHaveCount(0);
    await expect(page.getByText('Tap a track to set or clear the ceiling.')).toHaveCount(0);
  });
});
