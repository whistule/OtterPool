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
    // Profile screen renders details once contacts/profile load.
    await expect(page.getByText('Personal details').first()).toBeAttached({
      timeout: 15_000,
    });
  });

  test('edits personal details and persists across reload', async ({ page }) => {
    await page.locator('[data-testid="profile-edit"]:visible').click();

    // The edit form shows the same labels — fill the inputs that appear.
    const inputs = page.locator('input:visible, textarea:visible');
    // Inputs in field order: full name, display name, phone, dob, bc, medical
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

    // Reload — values come from the database, not just local state.
    await page.reload();
    await expect(page.getByText('E2E Member Full').first()).toBeAttached({
      timeout: 15_000,
    });
    await expect(page.getByText('07700 900111').first()).toBeAttached();
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

  test('adds, edits, makes primary, and removes an emergency contact', async ({
    page,
  }) => {
    // --- add ---
    await page.locator('[data-testid="contact-add"]:visible').click();
    await page.locator('[data-testid="contact-field-name-new"]:visible').fill('Anna Plant');
    await page
      .locator('[data-testid="contact-field-phone-new"]:visible')
      .fill('07700 900456');
    await page.locator('[data-testid="contact-save-new"]:visible').click();

    // The new contact row appears with name + phone. Edit button has the
    // contact id baked into its testID, so we don't need to know the id —
    // we wait for the visible name to anchor.
    await expect(page.getByText('Anna Plant').first()).toBeAttached({
      timeout: 15_000,
    });
    await expect(page.getByText('07700 900456').first()).toBeAttached();

    // --- edit ---
    // There is a single non-primary contact, so its Edit button is the only
    // one matching `[data-testid^="contact-edit-"]`.
    await page.locator('[data-testid^="contact-edit-"]:visible').first().click();
    // Form opens prefilled — replace the name and phone.
    const nameField = page
      .locator('input[data-testid^="contact-field-name-"]:visible')
      .first();
    await nameField.fill('');
    await nameField.fill('Anna P. Plant');
    const phoneField = page
      .locator('input[data-testid^="contact-field-phone-"]:visible')
      .first();
    await phoneField.fill('');
    await phoneField.fill('07700 900222');
    await page.locator('[data-testid^="contact-save-"]:visible').first().click();

    await expect(page.getByText('Anna P. Plant').first()).toBeAttached({
      timeout: 15_000,
    });
    await expect(page.getByText('07700 900222').first()).toBeAttached();
    await expect(page.getByText('Anna Plant', { exact: true })).toHaveCount(0);

    // --- make primary ---
    await page
      .locator('[data-testid^="contact-make-primary-"]:visible')
      .first()
      .click();
    await expect(page.getByText('Primary').first()).toBeAttached({ timeout: 15_000 });
    // The Make-primary button is gone now that this contact is primary.
    await expect(
      page.locator('[data-testid^="contact-make-primary-"]:visible'),
    ).toHaveCount(0);

    // --- remove (web confirm()) ---
    page.once('dialog', (d) => d.accept());
    await page.locator('[data-testid^="contact-remove-"]:visible').first().click();
    await expect(page.getByText('Anna P. Plant')).toHaveCount(0, { timeout: 15_000 });
  });
});
