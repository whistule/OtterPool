/**
 * Absolute URL for an in-app route, for handing to something that will send
 * the user back to us - Supabase auth emails, Stripe Checkout return URLs.
 *
 * The web build is served from the root of https://otterpool.dckc.co.uk, so
 * the bare origin is the right base and this is close to a one-liner today.
 * It stays because getting it wrong is expensive and silent: when the site
 * lived at https://whistule.github.io/OtterPool/ the origin dropped the base
 * path, which meant a 404 after Stripe checkout and, for Supabase auth links,
 * something worse — the URL wasn't in the project's redirect allow-list, so
 * Supabase discarded it and substituted the dashboard's Site URL. That is how
 * password reset emails ended up pointing at http://localhost:3000.
 *
 * `EXPO_BASE_URL` is inlined from experiments.baseUrl, which is now unset. If
 * a base path is ever reintroduced this keeps working: the dev server still
 * serves routes at the root, so the prefix is only applied when the page
 * really is being served underneath it.
 */
export function webRouteUrl(path: string): string {
  const base = process.env.EXPO_BASE_URL ?? '';
  const prefix = base && window.location.pathname.startsWith(base) ? base : '';
  return new URL(prefix + path, window.location.origin).toString();
}
