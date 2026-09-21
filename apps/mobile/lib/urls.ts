/**
 * Absolute URL for an in-app route, for handing to something that will send
 * the user back to us - Supabase auth emails, Stripe Checkout return URLs.
 *
 * The web build is served from https://whistule.github.io/OtterPool/, but
 * `window.location.origin` is just https://whistule.github.io - it drops the
 * base path. Building return URLs from the bare origin gets you a 404 after
 * Stripe checkout, and for Supabase auth links something worse: the URL isn't
 * in the project's redirect allow-list, so Supabase quietly discards it and
 * substitutes the dashboard's Site URL instead. That's how password reset
 * emails ended up pointing at http://localhost:3000.
 *
 * `EXPO_BASE_URL` is inlined as "/OtterPool" from experiments.baseUrl, but the
 * dev server still serves routes at the root, so it can't just be prepended -
 * only apply it when the page really is being served underneath it.
 */
export function webRouteUrl(path: string): string {
  const base = process.env.EXPO_BASE_URL ?? '';
  const prefix = base && window.location.pathname.startsWith(base) ? base : '';
  return new URL(prefix + path, window.location.origin).toString();
}
