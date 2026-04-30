# Agent notes

## Running the Playwright e2e suite

The host is NixOS, so Playwright's bundled Chromium download won't run. Browsers
come from `pkgs.playwright-driver.browsers` via `app/devenv.nix`, and the
suite must be invoked inside the devenv shell so `PLAYWRIGHT_BROWSERS_PATH`
points at the nix store path.

1. Reseed fixtures (idempotent, requires `supabase/config.secret.js` with the
   service role key):

   ```sh
   cd supabase && npm run seed:e2e
   ```

   This recreates two events: `E2E Manual Review Trip` (frog min level) and
   `E2E Selkie Only Trip` (selkie min level). Test users:
   - `e2e-leader@test.com` — selkie, password `e2e-test-password`
   - `e2e-member@test.com` — duck, password `e2e-test-password`

2. Run the suite from `app/`:

   ```sh
   cd app && devenv shell -- npx playwright test
   ```

   Or a single spec: `devenv shell -- npx playwright test e2e/calendar-filter.spec.ts`.

   Playwright auto-starts the Expo web server on port 8081 (see
   `playwright.config.ts`) — no need to start it yourself.

## RN-Web quirks the e2e specs have to work around

- `Text` with `numberOfLines={N}` renders via `display: -webkit-box` line
  clamping. Playwright's `toBeVisible()` flags those elements as "hidden", so
  use `toBeAttached()` for presence checks against event titles.
- expo-router on web keeps the previously-active tab screen mounted alongside
  the current one. Every locator that touches calendar content can resolve to
  two elements — only the visible copy reflects current state. Scope to
  `:visible` (e.g. `locator('input[...]:visible')` or chain
  `.locator('visible=true')`) before `fill`/`click`/`toHaveCount(0)`.
