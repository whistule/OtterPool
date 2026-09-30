# OtterPool

Club management app for [DCKC](https://dckc.co.uk), Drumchapel and Clydebank Kayak Club in Glasgow. Members browse and sign up to trips, leaders run their events and review sign-ups, and admins look after membership and levels.

Live on the web at https://otterpool.dckc.co.uk, with Android builds via EAS.

## Stack

- `apps/mobile/` - Expo Router app (iOS / Android / web), React Native + TypeScript
- `supabase/` - Postgres schema and RLS in `migrations/`, edge functions in `functions/` (sign-up, review, cancel, Stripe webhook, push notifications)
- Payments through Stripe Checkout, push through Expo
- `devenv.nix` - dev shell with Node, Biome, the Supabase CLI and Playwright's browsers

## Running locally

```sh
cp apps/mobile/.env.example apps/mobile/.env.local   # dev project values
cd apps/mobile && npm install
npx expo start --web
```

The app refuses to start without `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`, there is no fallback on purpose. See `AGENTS.md` for the details and the Metro cache gotcha.

### With a local backend (works on Windows)

Runs the whole Supabase stack in Docker from `supabase/config.toml` - Postgres with every migration applied, auth, storage and the edge functions. Needs Docker Desktop and Node 24. On Windows use WSL2 and clone the repo inside the WSL filesystem, Metro doesnt see file changes on a mounted Windows drive.

```sh
npx supabase@2.111.0 start      # from the repo root, first run pulls the images
npx supabase@2.111.0 status     # prints the API URL, anon key and service role key
```

Put the API URL (`http://127.0.0.1:54321`) and anon key in `apps/mobile/.env.local`, then for some test users and trips:

```sh
cd supabase
cp config.js config.secret.js   # set SUPABASE_URL to http://127.0.0.1:54321 and add the local keys
npm install && npm run seed:e2e
```

That gives you `e2e-leader@test.com` (selkie) and `e2e-member@test.com` (duck), both with password `e2e-test-password`. Then start the app as above with `npx expo start --web --clear`. Studio is at http://localhost:54323 and any emails the stack sends land in http://localhost:54324.

Stripe isnt configured locally, so free trips work but paid sign-ups fail at checkout. `npx supabase@2.111.0 stop` shuts it down.

## Tests

| What | Command | Where it runs |
|---|---|---|
| Format + lint (Biome) | `npm run check` from the root | CI (`test.yml`) |
| Typecheck | `npx tsc --noEmit` in `apps/mobile` | CI |
| Unit tests - `apps/mobile/lib/*.test.ts` and `supabase/functions/_shared/*.test.ts` | `npm run test:unit` in `apps/mobile` | CI |
| e2e (Playwright), including the RLS guards in `e2e/rls-guards.spec.ts` | `npm run test:e2e` in `apps/mobile` | locally only |

e2e stays out of CI because it seeds fixtures with the service-role key against a hosted project, so running it per PR would write to a live database. `AGENTS.md` covers running it on NixOS.

## Deploys

Everything deploys on merge to `main`:

- `deploy-web.yml` - exports the web build and publishes it to GitHub Pages
- `deploy-supabase.yml` - applies pending migrations, then deploys the edge functions (in that order, since functions depend on new columns)

## Roles and levels

Progression levels, low to high: 🐸 Frog, 🦆 Duck, 🦦 Otter, 🐬 Dolphin, 🦭 Selkie (BC-qualified leader). Selkies can create and lead events, and an event's minimum level gates who can sign up.

Admin roles are separate flags on the profile: membership admin (member status and the membership list import), paddling admin (levels, approval ceilings, any event) and super admin (both, plus granting roles). RLS and triggers enforce all of this in the database, the UI only hides what you cant do.

Membership status is `aspirant` until the member's email matches the club's imported membership list. Aspirants get 3 trial events before they need to join. See `docs/membership-verification.md`.

## Docs

- `docs/DCKC-Platform-Spec-v0.9.md` - the original spec
- `docs/membership-verification.md` - membership list matching and trial rules
- `docs/otterpool.html`, `docs/otter-pool-*.html` - the HTML wireframes the app started from, kept for reference
