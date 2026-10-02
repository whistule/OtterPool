import { expect, test, type Page } from '@playwright/test';

const MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL ?? 'e2e-member@test.com';
const LEADER_EMAIL = process.env.E2E_LEADER_EMAIL ?? 'e2e-leader@test.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-test-password';
// Selkie minimum; the e2e member is a duck, so they're below it.
const FIXTURE_TITLE = 'E2E Selkie Only Trip';
const MEMBER_DISPLAY = 'E2E Member';
const BOAT_ANSWER = 'P&H Cetus MV, E2E below-level';

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
  const card = page
    .locator('[data-testid^="calendar-event-"]:visible')
    .filter({ hasText: FIXTURE_TITLE });
  await expect(card.first()).toBeAttached({ timeout: 15_000 });
  await card.first().click();
  await page.waitForURL(/\/event\/[0-9a-f-]{36}/, { timeout: 15_000 });
  await expect(page.locator('[data-testid="event-back"]:visible')).toBeVisible({
    timeout: 15_000,
  });
}

test.describe('below-level request reaches the leader with experience', () => {
  test('member fills in experience and asks, leader sees the answers and confirms', async ({
    page,
    context,
  }) => {
    // --- member: below the minimum, so they're asked for their experience ---
    await context.clearCookies();
    await signIn(page, MEMBER_EMAIL);
    await openFixtureFromCalendar(page);
    const eventUrl = page.url();
    await expect(page.locator('[data-testid="event-below-level"]:visible')).toBeAttached({
      timeout: 15_000,
    });
    const cta = page.locator('[data-testid="event-primary-cta"]:visible');
    await expect(cta).toHaveText('Tell us your experience first');
    await cta.click();

    // --- the profile opens the form; saving goes back to the trip ---
    await page.waitForURL(/\/profile/, { timeout: 15_000 });
    await page
      .locator('[data-testid="experience-field-years"]:visible')
      .fill('6 years, ~40 days a year');
    await page.locator('[data-testid="experience-field-boat"]:visible').fill(BOAT_ANSWER);
    await page.locator('[data-testid="experience-save"]:visible').click();
    await page.waitForURL(/\/event\/[0-9a-f-]{36}/, { timeout: 15_000 });

    // --- now they can ask the leader ---
    await expect(cta).toHaveText('Ask the leader', { timeout: 15_000 });
    await cta.click();
    await expect(page.getByText('⚠️ Pending leader review').first()).toBeAttached({
      timeout: 15_000,
    });

    // --- leader: request is flagged, with the answers alongside ---
    await context.clearCookies();
    await signIn(page, LEADER_EMAIL);
    await openFixtureFromCalendar(page);
    expect(page.url()).toBe(eventUrl);
    await page.locator('[data-testid="event-review-cta"]:visible').click();
    await expect(page.getByText(MEMBER_DISPLAY).first()).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('[data-testid^="review-below-level-"]:visible')).toHaveCount(1);
    const experience = page.locator('[data-testid^="review-experience-"]:visible');
    await expect(experience).toContainText(BOAT_ANSWER, { timeout: 15_000 });

    await page.locator('[data-testid^="review-confirm-"]:visible').first().click();
    await expect(page.getByText('No one is waiting for review.').first()).toBeAttached({
      timeout: 15_000,
    });

    // --- after deciding, the leader can still read it on the member's profile ---
    // Via the trip's participant list, where they now appear as confirmed.
    await page.goBack();
    await page.waitForURL(/\/event\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    const participant = page.getByText(MEMBER_DISPLAY).locator('visible=true').first();
    await expect(participant).toBeAttached({ timeout: 15_000 });
    await participant.click();
    await page.waitForURL(/\/profile\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await expect(page.getByText(BOAT_ANSWER).first()).toBeAttached({ timeout: 15_000 });
    // Marking a level review done stays with coaches.
    await expect(page.locator('[data-testid="mark-reviewed-cta"]:visible')).toHaveCount(0);
  });
});
