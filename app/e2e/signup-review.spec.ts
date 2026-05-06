import { expect, test, type Page } from '@playwright/test';

const MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL ?? 'e2e-member@test.com';
const LEADER_EMAIL = process.env.E2E_LEADER_EMAIL ?? 'e2e-leader@test.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-test-password';
const FIXTURE_TITLE = 'E2E Manual Review Trip';
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

async function openFixtureFromCalendar(page: Page) {
  // signIn lands on the calendar — an extra goto('/') after a fresh login
  // races AuthGate's session resolve and locks the page on a spinner.
  const card = page
    .locator('[data-testid^="calendar-event-"]:visible')
    .filter({ hasText: FIXTURE_TITLE });
  await expect(card.first()).toBeAttached({ timeout: 15_000 });
  await card.first().click();
  await expect(page.getByText('Manual review').first()).toBeAttached({ timeout: 15_000 });
}

test.describe('manual_all sign-up + leader review + my-trips', () => {
  test('member signs up, sees the trip in My Trips, leader confirms, member sees confirmed', async ({
    page,
    context,
  }) => {
    // --- member signs up via the calendar ---
    await context.clearCookies();
    await signIn(page, MEMBER_EMAIL);
    await openFixtureFromCalendar(page);
    await page.locator('[data-testid="event-primary-cta"]:visible').click();
    await expect(page.getByText('⚠️ Pending leader review').first()).toBeAttached({
      timeout: 15_000,
    });

    // --- the trip appears on My Trips with the pending-review pill ---
    // event/[id] is its own stack screen; pop back to the (tabs) layout via
    // the in-app Back button rather than goto('/my-trips'), which forces a
    // full reload and races AuthGate.
    await page.getByText('‹ Back').first().click();
    await page.locator('a[href="/my-trips"]:visible').first().click();
    await expect(
      page.locator(`text=${FIXTURE_TITLE}`).locator('visible=true').first(),
    ).toBeAttached({ timeout: 15_000 });
    await expect(
      page.locator('text=Pending review').locator('visible=true').first(),
    ).toBeAttached();

    // --- leader confirms via the review screen ---
    await context.clearCookies();
    await signIn(page, LEADER_EMAIL);
    await openFixtureFromCalendar(page);
    await page.locator('[data-testid="event-review-cta"]:visible').click();
    await expect(page.getByText(MEMBER_DISPLAY).first()).toBeAttached({ timeout: 15_000 });
    await page.locator('[data-testid^="review-confirm-"]:visible').first().click();
    // Free event → goes straight to "confirmed" once approved, so the queue
    // empties.
    await expect(page.getByText('No one is waiting for review.').first()).toBeAttached({
      timeout: 15_000,
    });

    // --- member sees confirmed status ---
    await context.clearCookies();
    await signIn(page, MEMBER_EMAIL);
    await openFixtureFromCalendar(page);
    await expect(page.getByText('✅ Confirmed').first()).toBeAttached({ timeout: 15_000 });
  });
});
