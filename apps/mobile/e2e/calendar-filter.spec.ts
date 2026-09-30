import { expect, test, type Page } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL ?? 'e2e-member@test.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-test-password';

const FIXTURE_EVENT_TITLE = 'E2E Manual Review Trip';
const FIXTURE_SELKIE_TITLE = 'E2E Selkie Only Trip';

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

// React Native Web renders Text with `numberOfLines` via webkit-box
// line-clamping, which Playwright's visibility heuristic flags as "hidden".
// expo-router on web also keeps the previous tab's screen mounted, so the
// title appears twice in the DOM — only the visible copy reflects the
// current filter state. Scope all calendar assertions to visible elements.
const expectTitlePresent = async (page: Page, title: string) => {
  await expect(page.getByText(title).first()).toBeAttached({ timeout: 15_000 });
};

const expectTitleAbsent = async (page: Page, title: string) => {
  await expect(page.getByText(title).locator('visible=true')).toHaveCount(0);
};

test.describe('calendar filtering', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await signIn(page);
    // Both fixture events should be on the calendar after sign-in.
    await expectTitlePresent(page, FIXTURE_EVENT_TITLE);
    await expectTitlePresent(page, FIXTURE_SELKIE_TITLE);
  });

  test('search box filters by title', async ({ page }) => {
    // expo-router renders both the active and previous tab on web — pick the
    // visible copy of the input.
    const search = page.locator('input[placeholder="Search title, location or leader"]:visible');
    await search.fill('selkie only');

    await expectTitlePresent(page, FIXTURE_SELKIE_TITLE);
    await expectTitleAbsent(page, FIXTURE_EVENT_TITLE);

    await search.fill('zzz-no-such-event');
    await expect(page.getByText('No events match your filters.').first()).toBeAttached();
  });
});
