# Agent notes

## Environment variables (required)

`apps/mobile/lib/supabase.ts` throws when `EXPO_PUBLIC_SUPABASE_URL` /
`EXPO_PUBLIC_SUPABASE_ANON_KEY` are unset — there is deliberately no fallback,
so a misconfigured build can't come up silently pointed at the wrong database.
The easy way to get them is to run everything against a local stack (needs
Docker), which writes `.env.local` and `supabase/config.secret.js` if they're
missing, seeds the e2e fixtures and starts Expo web:

```sh
cd apps/mobile && npm run dev:local
```

Or copy the local-stack values by hand:

```sh
cp apps/mobile/.env.example apps/mobile/.env.local
```

`.env.local` is gitignored and holds **local stack** values. Production
and preview builds ignore it entirely and take their values from the `env`
blocks in `eas.json` / `.github/workflows/deploy-web.yml`.

Note: Metro caches the inlined values. After changing an `EXPO_PUBLIC_*` var,
export with `--clear` or you will keep getting the previous project's URL baked
into the bundle.

## Running the Playwright e2e suite

The host is NixOS, so Playwright's bundled Chromium download won't run. Browsers
come from `pkgs.playwright-driver.browsers` via the repo-root `devenv.nix`, and
the suite must be invoked inside the devenv shell so `PLAYWRIGHT_BROWSERS_PATH`
points at the nix store path.

1. Start the local stack (needs Docker). This seeds the fixtures and serves
   the app on 8081, which Playwright reuses:

   ```sh
   cd apps/mobile && npm run dev:local
   ```

   `npm run test:e2e` reseeds before every run (`pretest:e2e`), against
   whatever `supabase/config.secret.js` points at, which `dev:local` writes
   for the local stack. Test users, all with password `e2e-test-password`:
   `e2e-leader@test.com` (selkie), `e2e-member@test.com` (duck),
   `e2e-membership-admin@test.com` and `e2e-paddling-admin@test.com`.

2. Run the suite. `devenv.nix` lives at the repo root, so enter the devenv
   shell from the root, then cd into the mobile app:

   ```sh
   devenv shell -- bash -c 'cd apps/mobile && npm run test:e2e'
   ```

   If your shell already has `direnv` loaded for the repo, the env is
   inherited in subdirectories and you can just:

   ```sh
   cd apps/mobile && npx playwright test
   ```

   For a single spec, append the path: `npx playwright test e2e/calendar-filter.spec.ts`.

   If nothing is on 8081 Playwright starts Expo itself (see
   `playwright.config.ts`), which also reads `.env.local` for the specs
   that call Supabase directly.

## RN-Web quirks the e2e specs have to work around

- `Text` with `numberOfLines={N}` renders via `display: -webkit-box` line
  clamping. Playwright's `toBeVisible()` flags those elements as "hidden", so
  use `toBeAttached()` for presence checks against event titles.
- expo-router on web keeps the previously-active tab screen mounted alongside
  the current one. Every locator that touches calendar content can resolve to
  two elements — only the visible copy reflects current state. Scope to
  `:visible` (e.g. `locator('input[...]:visible')` or chain
  `.locator('visible=true')`) before `fill`/`click`/`toHaveCount(0)`.
