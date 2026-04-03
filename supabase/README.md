# OtterPool — Supabase Backend

## Prerequisites

- Node.js (you have v22)
- A Supabase project — create one free at [supabase.com/dashboard](https://supabase.com/dashboard)

## Setup

### 1. Link to your Supabase project

Go to your Supabase dashboard → Project Settings → General to find your **project ref** (the string in your project URL: `https://<project-ref>.supabase.co`).

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
```

It will prompt for your database password (the one you set when creating the project).

### 2. Push the migration

This applies the events schema (profiles, event_categories, events, event_signups) and RLS policies:

```bash
npx supabase db push
```

### 3. Create test users

In the Supabase dashboard → Authentication → Users → Add User, create a few test accounts:

| Email | Purpose |
|---|---|
| `leader@test.com` | A Selkie who creates events |
| `member1@test.com` | An active Dolphin member |
| `member2@test.com` | An active Duck member |
| `member3@test.com` | An aspirant Frog |

The `on_auth_user_created` trigger will auto-create a row in `profiles` for each.

### 4. Seed with dummy data

Open `seed.sql`, uncomment the update/insert blocks, and replace the `<leader-uuid>` / `<memberN-uuid>` placeholders with the real UUIDs from the Auth dashboard. Then run:

```bash
npx supabase db push --include-seed
```

Or paste the SQL directly into the Supabase SQL Editor.

## What's in the migration

| Object | Type | Purpose |
|---|---|---|
| `profiles` | table | Member record, auto-created from auth signup |
| `event_categories` | table | 14 pre-seeded categories from the spec |
| `events` | table | Event details — leader, grade, capacity, cost, status |
| `event_signups` | table | Member sign-ups with status tracking |
| `calendar_events` | view | Joins events + categories + leader + signup counts |
| RLS policies | — | Auth-based access: read-all for events, self-only for signups, leader-only for management |

## Connecting the frontend

Grab your project URL and anon key from Supabase dashboard → Settings → API.

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
  const supabase = supabase.createClient(
    'https://<project-ref>.supabase.co',
    '<anon-key>'
  );
</script>
```

Example — fetch upcoming events:

```js
const { data: events } = await supabase
  .from('calendar_events')
  .select('*')
  .gte('starts_at', new Date().toISOString())
  .order('starts_at');
```

## Edge Functions

Business logic lives in `functions/`. Each subfolder is a separate serverless endpoint.

### sign-up

`POST /functions/v1/sign-up` — handles event sign-up with all the spec logic:

1. Validates auth token
2. Checks member status (rejects lapsed/suspended)
3. Checks progression level against event minimum
4. Checks capacity — waitlists if full
5. Checks approval mode — auto-confirms or queues for leader review
6. Auto-marks event as "full" when it hits capacity

**Request:**
```json
{ "event_id": "uuid-here" }
```

**Response:**
```json
{
  "signup": { "id": "...", "event_id": "...", "member_id": "...", "status": "confirmed" },
  "message": "You're in! Sign-up confirmed"
}
```

Possible statuses returned: `confirmed`, `pending_review`, `waitlisted`.

**Calling from the frontend:**
```js
const { data, error } = await supabase.functions.invoke('sign-up', {
  body: { event_id: 'some-event-uuid' },
});
```

### Deploying functions

```bash
npx supabase functions deploy sign-up
```

Or deploy all at once:

```bash
npx supabase functions deploy
```

## Useful commands

```bash
npx supabase db push          # apply migrations to remote
npx supabase db diff           # generate migration from remote changes
npx supabase db reset          # reset remote db and re-run migrations (destructive)
npx supabase gen types --lang=typescript --project-id <ref> > types.ts
```
