# OtterPool mobile

Expo Router app. All commands below run from this directory (`apps/mobile/`).

## Day-to-day dev

```bash
npm install                       # first time only
npx expo start --dev-client       # serves JS to a dev client on device
npx expo start --web              # web build, used by Playwright e2e
```

`--dev-client` only works once you have a development build installed on the device — see below. Expo Go does **not** work on SDK 54 because we use plugins (notifications etc.) that need a custom native shell.

## Builds (EAS)

Three profiles are defined in `eas.json`:

| Profile       | Output         | Use when                                                            |
| ------------- | -------------- | ------------------------------------------------------------------- |
| `development` | APK (dev client) | Day-to-day work. Loads JS from Metro, needs `npx expo start --dev-client` running |
| `preview`     | APK (standalone) | Carrying the app around to test push, lock-screen, offline behaviour without Metro |
| `production`  | AAB             | Play Store submission                                              |

> **TODO (before first prod release):** split staging/prod Firebase. The current `google-services.json` and Expo project point at a single Firebase project, which is fine for testing but means any "real" install would share push credentials with dev. When ready:
> - create a second Firebase project for prod
> - switch the production profile to a separate `android.package` (e.g. drop `.staging` from the current package and use `com.robertplant.otterpool` for prod, `.staging` for everything else)
> - either swap to `app.config.js` so each profile picks its own `googleServicesFile`, or use an EAS file secret to inject the prod one at build time
> - upload a second FCM V1 service-account key via `eas credentials` against the prod profile

### First-time setup

```bash
npx eas login                     # use your expo.dev account
npx eas init                      # only if app.json has no extra.eas.projectId
```

`eas init` writes the project's `projectId` and `owner` to `app.json` — verify they end up there (not in a stray repo-root `app.json`).

### Build commands

```bash
# Standard dev build — install, then run `npx expo start --dev-client`
npx eas build --profile development --platform android

# Standalone APK — install and run with no laptop required
npx eas build --profile preview --platform android
```

Builds run in the EAS cloud (~15-25 min). When done, EAS gives you a URL; download the APK, install on your phone. If reinstalling, uninstall the previous build first or you'll hit a signature conflict.

iOS builds need an Apple Developer account and aren't currently set up.

## Push notifications

Push tokens are registered automatically on login (see `lib/notifications.ts`) and stored in `public.user_push_tokens`. Server-triggered push fires from the supabase edge functions (`sign-up`, `review-signup`, `stripe-webhook`) via `_shared/push.ts`.

**Important:** push requires a dev or preview build. It will not work in Expo Go, and it will silently fail if `app.json` is missing `extra.eas.projectId`.

Local reminders (24h before an event) are scheduled on-device from the event screen when a signup becomes `confirmed`.

## Testing

```bash
npm run test:e2e                  # Playwright against web build
npm run test:e2e:ui               # Playwright UI mode
```

E2E tests reseed the local Supabase DB first — see `supabase/seed-e2e.js`.
