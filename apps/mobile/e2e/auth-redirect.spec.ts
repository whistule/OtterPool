import { expect, test } from '@playwright/test';

// Guards lib/urls.ts. Password reset emails from the deployed site were sending
// people to http://localhost:3000: the app built redirectTo from
// window.location.origin, which drops the /OtterPool base path, and Supabase
// discards a redirect that isn't in its allow-list and silently substitutes the
// dashboard Site URL. The bug is invisible from the app - you only see it in the
// email - so assert on the request instead.
//
// The recover call is intercepted and stubbed, so no reset email is actually
// sent and the hosted project's rate limit is left alone.
test.describe('auth redirect URLs', () => {
  test('password reset asks Supabase to return to this deployment, not a bare origin', async ({
    page,
  }) => {
    await page.route('**/auth/v1/recover*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );

    await page.goto('/forgot-password');
    await page.getByPlaceholder('you@example.com').fill('e2e-member@test.com');

    const recoverRequest = page.waitForRequest('**/auth/v1/recover*', { timeout: 15_000 });
    await page.getByText('Send reset link', { exact: true }).click();
    const recoverUrl = (await recoverRequest).url();

    const redirectTo = new URL(recoverUrl).searchParams.get('redirect_to');
    if (redirectTo === null) {
      throw new Error(`no redirect_to on the recover request: ${recoverUrl}`);
    }

    // Whatever host the suite runs against, the redirect has to be an absolute
    // URL on that same origin and land on the reset screen - never a bare
    // origin, and never some other host.
    const redirect = new URL(redirectTo);
    expect(redirect.origin).toBe(new URL(page.url()).origin);
    expect(redirect.pathname.endsWith('/reset-password')).toBe(true);

    // The base path is only in play when the app is actually served under it
    // (the dev server serves at the root even though EXPO_BASE_URL is set), so
    // tie the assertion to where this page really is rather than hardcoding it.
    const servedUnder = new URL(page.url()).pathname.replace(/\/forgot-password\/?$/, '');
    expect(redirect.pathname).toBe(`${servedUnder}/reset-password`);
  });

  // The reset screen used to run its own exchangeCodeForSession on web, on top
  // of the one supabase-js already does via detectSessionInUrl. The first
  // exchange consumed the verifier and signed you in; the second then failed
  // with the raw "PKCE code verifier not found in storage" string, so you got
  // logged in AND shown an error. The screen must never do that exchange on
  // web now, which means that string must never reach the user.
  test('the reset screen does not surface a raw PKCE error on web', async ({ page }) => {
    await page.goto('/reset-password?code=not-a-real-code');
    await expect(page.getByText('Choose a new password').first()).toBeAttached({
      timeout: 15_000,
    });

    // The screen shows a friendly message on a 10s timeout, so check before it.
    await page.waitForTimeout(5_000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('code verifier not found');
    expect(body).not.toContain('@supabase/ssr');
  });
});
