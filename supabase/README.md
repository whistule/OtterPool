# OtterPool - Supabase

Schema, RLS and edge functions for the app. Production deploys itself: `deploy-supabase.yml` runs `supabase db push` then `supabase functions deploy` on every merge to `main` that touches this folder, so you shouldnt need to push to production by hand.

## Layout

| Path | What |
|---|---|
| `migrations/` | Every schema, RLS policy, trigger and RPC change, applied in filename order |
| `functions/` | Edge functions - `sign-up`, `review-signup`, `cancel-signup`, `stripe-webhook`, `payment-return`, `notify-event-created`, `notify-event-cancelled` |
| `functions/_shared/` | Code shared between functions (capacity, pricing, push, auth helpers), with unit tests alongside |
| `config.toml` | Local Supabase config. Hosted auth settings live in the dashboard, not here |
| `seed-e2e.js` | Idempotent e2e fixtures (users + events) |
| `setup-test-users.js` | Demo users and events for poking around the dev project |

## Projects

- **local** - `supabase start`, see the root README. Throwaway, so the seed scripts are allowed to run against it
- **dev** - `fguutbhbzradrdyrxixg`. The seed scripts only run against this one or a local stack, `assert-dev-project.js` refuses anything else
- **production** - `cunkkdbfylimkktwgfle`. Only CI writes to it

## Writing a migration

Add a new timestamped file to `migrations/`, never edit one thats been applied. Use `create or replace` / `drop ... if exists` so a migration can be replayed. Every table gets RLS enabled in the same migration that creates it.

The `supabase` CLI comes from devenv. To try a migration against dev before merging:

```sh
supabase link --project-ref fguutbhbzradrdyrxixg
supabase db push
```

## Seed scripts

Both need the dev service-role key:

```sh
cp config.js config.secret.js   # fill in SUPABASE_SERVICE_ROLE_KEY, gitignored
npm install
npm run seed:e2e    # e2e fixtures, also run automatically by `npm run test:e2e`
npm run setup       # demo users
```

## Function secrets

Set in the dashboard (Edge Functions → Secrets) per project: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase.

`stripe-webhook` and `payment-return` run with `verify_jwt = false` (see `config.toml`) - Stripe cant send a Supabase JWT, so the webhook checks the Stripe signature instead.

A payment that arrives for a sign-up that no longer exists (cancelled mid-checkout, event deleted) is written to `unmatched_payments` so it can be refunded, paddling admins can read it.
