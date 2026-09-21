# OtterPool — Membership Verification (Design Proposal)

**Status:** Proposal · review-only · nothing implemented
**Scope:** Mirror "who is a paid-up DCKC member this year" from MemberMojo into
OtterPool so the app can gate event sign-up on membership.
**Date:** 2026-09-21

---

## 1. Decisions locked so far

- **MemberMojo stays the source of truth.** Renewals, payments, Gift Aid, and
  member comms remain in MemberMojo. OtterPool only *mirrors* who is currently
  a paid member. Managing membership fully in-app is a separate, later decision.
- **Sync via an email export, not an API.** The club provides an export of the
  email addresses of verified members. This avoids depending on MemberMojo's
  integration surface.
- **Build this before the ICE safety work** — it is foundational (it gates
  event sign-up) and lower-risk (ordinary personal data, no special-category
  medical data, no offline caching).
- **This is independent of the ICE new/existing split**, which keys off
  OtterPool account age, not membership status.

---

## 2. How it fits the existing system

Very little is new. The pieces already in place:

| Existing piece | Role here |
|---|---|
| `profiles.status` enum (`active` / `aspirant` / `lapsed` / `suspended`) | "Confirmed member" = `active`; non-match = `aspirant` |
| `sign-up` edge function already blocks `lapsed` (line ~60) | The event gate consumes membership status **for free** |
| Membership-admin role + status editing | The manual-override escape hatch already exists |
| `admin_audit_log` + triggers | Status changes are already audited |
| `auth.users` already stores every member's email | The email list is not a *new kind* of data for the system |

New bits: a `verified_members` table, an import path, a match-on-account-creation
step, and a reconcile job.

---

## 3. Data model

```sql
-- Verified paid members mirrored from MemberMojo.
create table public.verified_members (
  email_norm    text primary key,     -- lower(trim(email)); see §7 for hashed variant
  membership_year int,                 -- optional; cycle year, auto-stamped at import (paste has no dates)
  imported_at   timestamptz not null default now()
);
```

Notes:
- **`email_norm`** is the normalised key — `lower(trim(email))` — so matching is
  case/whitespace insensitive.
- Keep it minimal: email + a validity marker + when it was imported. No names,
  no other PII (data minimisation).
- One row per member. The table is **replaced** on each import (see §4), not
  appended.

### 3a. The migration file (draft)

Schema changes in this repo are **migration files**, applied in timestamp order
(forward-only — there are no down files by convention). The whole schema for
this feature is one new file. Timestamp must be later than the current last
migration (`20260622000000_event_photo_trgm.sql`).

```sql
-- supabase/migrations/20260921000000_verified_members.sql
-- ============================================================
-- OtterPool — Membership verification: verified_members mirror
-- ============================================================
-- Mirrors "paid DCKC member this year" from a MemberMojo email export.
-- Service-role only. See docs/membership-verification.md.

-- ---------- the mirrored list ----------
create table if not exists public.verified_members (
  email_norm      text primary key,     -- lower(trim(email))
  membership_year int,                   -- optional; cycle year, auto-stamped at import
  imported_at     timestamptz not null default now()
);

-- RLS ON, NO policies → only the service role (edge functions) can touch it.
-- service_role bypasses RLS; authenticated/anon get zero rows via the public API.
alter table public.verified_members enable row level security;

-- ---------- track who manages each member's status ----------
alter table public.profiles
  add column if not exists membership_source text
    not null default 'list'
    check (membership_source in ('list','manual'));

-- Rollout safety: existing members predate this system. Mark them 'manual' so
-- the FIRST reconcile can't auto-lapse anyone before they've been matched
-- against a real export. Matched members move to 'list' via the import/match
-- flow; unmatched stay 'manual' for an admin to review.
update public.profiles set membership_source = 'manual';
```

This is **schema only**. The import, match-on-creation, and reconcile logic
(§4–§6) live in an edge function / script, not this migration. Applied via the
Supabase CLI already in the devenv (`supabase db push` / `migration up`, or a
local `db reset` to rebuild). The e2e workflow reseeds fixtures afterwards.

---

## 4. Import flow

1. In MemberMojo, the membership admin copies the **email column** of the
   current-members table.
2. In an **admin-only import screen** in the app, they **paste the list** into a
   textarea and hit Import. The handler:
   - splits on newlines / commas / whitespace, **normalises** each
     (`lower(trim)`), drops blanks, and **dedupes**,
   - **replaces** the table contents (truncate + insert, in a transaction) so it
     always reflects the latest paste,
   - records the import (who, when, count) and shows a summary
     (e.g. "312 emails imported, 4 duplicates ignored").
3. Immediately run the **reconcile** (§6) so statuses reflect the new list.

No file/CSV parsing, no column mapping — just a pasted list of emails. There's
no per-member expiry data, so reconcile is **presence-based**: on the list =
member, off the list = not.

### 4a. Keeping imports timely — admin reminders

Rather than rely on the membership admin remembering, the app reminds them when
a fresh export is due. **Three reminders per year**, timed to the membership
**renewal date** (when membership actually turns over):

The club's membership year starts **1 October** (to confirm the exact day), so:

| When | Date | Why |
|---|---|---|
| Renewal **+ 2 weeks** | ~**15 Oct** | Catch the first wave of renewals (and non-renewals → lapses) |
| Renewal **+ 4 weeks** | ~**29 Oct** | Catch stragglers who renewed late |
| Renewal **+ 6 months** | ~**1 Apr** | Catch mid-year drift (new joins, off-cycle lapses) |

Delivered to **membership admins** as a push notification + an admin-screen
attention item: *"Membership export due — pull a fresh list from MemberMojo and
import it."* (The admin equivalent of the member attention items in §9.)

**Self-clearing.** `verified_members.imported_at` already records the last
import; a reminder only fires — and only persists — if **no import has happened
since** that reminder's date. An admin who's already imported isn't nagged.

**Mechanism:** a daily scheduled job (Supabase `pg_cron` or a scheduled edge
function) checks whether today is on/after a reminder date with no import since,
and if so notifies membership admins via the existing push infra
(`user_push_tokens` / `sendPush`).

**Config needed:** the club's **renewal date** — **1 October** (confirm the exact
day). Stored as a config value the three reminders are computed from, so it can
be changed without a code change.

**Accepted trade-off:** between the +4-week and +6-month reminders, and after
the +6-month one, the list can be up to ~6 months stale for an *off-cycle*
lapse. For a volunteer-run club that's fine — manual override and admin-set
`lapsed` / `suspended` handle urgent cases at any time.

---

## 5. Match on account creation

When a new account is created (verified auth email available):

- if `lower(trim(auth.email))` ∈ `verified_members` → set `profiles.status = 'active'`
- else → leave as `aspirant` (the column default)

Matching the **verified** auth email matters: Supabase confirms email ownership,
so a match proves the person controls that address — nobody can claim another
member's status without receiving their confirmation email. (Confirm email
verification is enabled.)

---

## 6. Reconcile — two-way, and protect manual overrides

The import must reconcile **both directions**, not just upgrade matches:

- **Upgrade:** `aspirant` whose email is now in the list → `active`.
- **Downgrade:** `active` whose email is **absent** from the newest list →
  `lapsed`. (Upgrade-only silently keeps ex-members in.)

**Protect manual overrides.** A membership admin may manually set someone
`active` (e.g. an email mismatch). The next import must not undo that. Add a
source marker so reconcile only touches list-managed rows:

```sql
alter table public.profiles
  add column membership_source text
    check (membership_source in ('list','manual')) default 'list';
```

Reconcile only downgrades rows where `membership_source = 'list'`. Manual
overrides (`'manual'`) are left alone and remain visible in the audit log.

**`suspended` is a sticky admin state — reconcile never touches it, in either
direction.** It's set (and only ever cleared) from the app's admin screen. So:
- A suspended member who *is* on the paid list must **not** be flipped to
  `active` by an import.
- A suspended member must **not** be re-suspended or downgraded to `lapsed`
  either — the state is owned by the admin, full stop.

Concretely, the reconcile query excludes `status = 'suspended'` from *both* the
upgrade and downgrade paths (regardless of `membership_source`). Since upgrade
only moves `aspirant → active` and downgrade only moves `active → lapsed`,
suspended rows are untouched by construction — but exclude them explicitly so a
future rule change can't leak. Same protection applies to `aspirant` — absence
from the paid list is their *normal* state (see §8).

---

## 7. Storing the email list securely in Supabase

The list is **ordinary personal data** (emails + "is a DCKC member"), not
special-category. Standard good practice is sufficient, and the comparison is
always **server-side** — the client never receives the list.

**v1 — RLS-locked, service-role only (recommended start):**
- Enable RLS on `verified_members` with **no** policy for `authenticated` /
  `anon`. Only the **service role** (edge functions) can read it. Logged-in
  users get zero rows via the public API.
- Supabase encrypts at rest (disk) and in transit (TLS) by default.
- The service-role key lives only in edge-function secrets, never in the app
  bundle (the codebase already does this in `sign-up`'s `admin` client).
- Replace the list each import; don't accumulate old ones.

```sql
alter table public.verified_members enable row level security;
-- (no authenticated/anon policies → service role only)
```

**v1.1 — optional hardening: hash the emails.**
Because the only operation is an *equality check*, the raw emails need not be
stored. Store `sha256(lower(trim(email)) + pepper)` where `pepper` lives in
edge-function secrets (not the DB), and compare hashes. A full DB compromise
then yields **useless hashes**, not a member list. The pepper is essential —
emails are low-entropy and a plain hash could be brute-forced.

**Trade-off:** hashing kills debuggability — an admin can't eyeball "why didn't
`john@…` match?" against a hashed list, and mismatches are the main operational
friction. So start plaintext (debuggable, already the app's sensitivity level),
and move to hashed only if minimising breach exposure outweighs operability.

---

## 8. Edge cases & friction

- **Email mismatch** (different address in MemberMojo vs the app) → a real member
  is treated as non-member. Mitigation: normalise, and keep the **manual
  override** path prominent. This is the main ongoing operational cost.
- **"Not on the list" ≠ banned.** Prospective/trial members legitimately aren't
  on the paid list. A non-match means **`aspirant`** (trial-session access),
  not lockout. (Ties to the club's aspirant concept — trial-session limits are
  a separate, not-yet-built feature.)
- **New join after export** → not matched until the next import. Mitigated by a
  frequent cadence + manual override for urgent cases.
- **Lapse mid-year** → downgraded to `lapsed` at the next reconcile; the
  sign-up gate then blocks them (already coded).

---

## 9. Member-state UX — what people see

The backend gate (the `sign-up` function) already rejects `lapsed` / `suspended`.
But a raw 403 at the sign-up button is a poor experience — people should **see**
their state before they hit the wall, and non-members need a clear path in. The
README already lists "membership renewal popups (aspirant/expiring/expired)" as
not-yet-built; this is that piece.

### Status → experience

| `profiles.status` | Who | What they see on open | Event sign-up |
|---|---|---|---|
| `active` | Paid member | **Events (calendar) by default** — unless an *attention item* interrupts first (ICE needs updating · an event-approval update · a level-approval update); see below | Full (still subject to level / ceiling / ICE gates) |
| `aspirant` | New unmatched signup, or prospective member | "Join DCKC" banner + **"3 trial events before you join"** note, with a **Join now** opt-in | **Same as members** — browse + sign up gated by *paddling level* (`meetsLevel`); the only extra is a **3-event cap**, then must join |
| `lapsed` | Membership expired | "Your membership has lapsed — renew" prompt → MemberMojo | Blocked (already 403) but with a **Renew** CTA, not a dead end |
| `suspended` | Admin action | "Your account is suspended — contact the club" | Blocked |

### Key touchpoints

1. **Sign-in / landing** — non-`active` states show a status banner; `active`
   members land on Events unless an attention item interrupts (below). Surfaces
   state early, before the sign-up button.
2. **Event sign-up CTA** — the important one. Active → normal CTA; aspirant →
   trial CTA or "Membership required" + join link; lapsed → "Renew to sign up".
   The button reflects state instead of failing after a tap.
3. **First run / onboarding** — matched new account → "Welcome, membership
   confirmed"; unmatched → aspirant welcome + how to join.
4. **Profile** — show membership status (+ type / renewal date if the export
   carries it) and a **Renew** link to MemberMojo. (The parity review flagged
   membership metadata as missing on Profile.)
5. **Mismatch recovery** — a real member whose email didn't match lands as
   `aspirant`. Give a "Not recognised? Contact the membership secretary" path so
   they can be manually verified (§6 override) rather than being silently stuck.

### Active-member landing: attention items

On open, an active member goes straight to **Events** — *unless* one or more
"attention items" need surfacing first (as a card / interstitial, or a prominent
strip above the calendar):

1. **ICE needs updating** — incomplete, expired under the 12-month lifecycle, or
   missing a now-required field. (Ties into the ICE work.)
2. **Event-approval update** — a `pending_review` sign-up was approved or
   declined; they should see the outcome.
3. **Level-approval update** — their level / progression was approved or changed
   by an admin.

If none apply → Events directly. This is *in-app* surfacing on open, distinct
from push notifications (which the app already sends for some of these). Items
2–3 depend on other features (approval flow, progression); ICE ties to the ICE
lifecycle — so the landing is a small router that checks each source.

### Aspirant access — DECIDED

Open question 5 is resolved. An aspirant does **the same as any member** —
browses and signs up for events — with **two independent gates**:

1. **Paddling level** (`meetsLevel`, already built): you can only sign up for
   events at or below your progression level. A **frog** can only join
   frog-level events; once they've done a capsize drill and progressed to
   **duck** (etc.), higher events open up. *This applies to everyone, member or
   not — it's the progression system, not membership.*
2. **Trial cap (membership-specific):** an aspirant may sign up for **up to 3
   events**, then must **join** to continue. A **Join now** opt-in is available
   at any time.

So an aspirant is *not* browse-only and *not* limited to a special event subset
— they get the normal level-gated experience, capped at 3 events.

This adds one new dependency — **trial-count tracking**: the `sign-up` gate gains
an aspirant branch that counts their trials and, on the 4th, returns a "join to
continue" prompt instead of confirming. It layers **on top of** the existing
level check (level first, then the cap). The count needs defining — confirmed
sign-ups vs attended, and whether cancelling frees a slot (open question 5).

None of this changes the enforcement model — the level gate and the trial cap
are both server-side in the `sign-up` function. The UX just surfaces state and a
path forward.

---

## 10. What this deliberately does NOT do

- No renewals, payments, Gift Aid, or member comms — all stay in MemberMojo.
- No full in-app membership management — that's a separate strategic decision.
- Does not affect the ICE new/existing split (account-age based).

---

## 11. Implementation checklist (for when approved)

**Backend / data**
- [ ] `verified_members` table + RLS (service-role only)
- [ ] `profiles.membership_source` column (`list` / `manual`) + rollout backfill
- [ ] Admin paste-list import screen (split/normalise/dedupe, replace-in-
      transaction, record import, show summary)
- [ ] Import-due reminders (§4a): renewal-date config, daily job, self-clearing
      via `imported_at`, push + admin attention item to membership admins
- [ ] Match-on-account-creation → set `active` / leave `aspirant`
- [ ] Reconcile function: upgrade + downgrade, skip `manual` / `aspirant` /
      `suspended`
- [ ] Confirm Supabase email verification is enabled

**UX (§9)**
- [ ] Status banner on sign-in (aspirant / lapsed / suspended)
- [ ] Active-member landing router: Events by default, else attention item
      (ICE update · event-approval update · level-approval update)
- [ ] Aspirant landing: "Join DCKC" banner + "3 trial events" note + Join-now
- [ ] Trial-count tracking + aspirant branch in the `sign-up` gate (allow ≤3,
      then prompt to join)
- [ ] State-aware event sign-up CTA (join / renew / trial)
- [ ] First-run: matched "welcome" vs unmatched aspirant onboarding
- [ ] Profile: membership status + Renew link to MemberMojo
- [ ] Mismatch recovery: "contact the membership secretary" path

**Testing / ops**
- [ ] e2e coverage: matched email → active + can sign up; unmatched → aspirant;
      lapsed after reconcile → blocked; manual override survives re-import
- [ ] Decide cadence (recommend monthly/quarterly) and who runs the import
- [ ] Optional: hashed-email hardening (§7 v1.1)

**Rough effort:** small–medium. Most of the gate and status machinery already
exists; the new work is the table, import, and reconcile.

---

## 12. Open questions for the club

1. ~~Import cadence?~~ **DECIDED: 3 reminders/year — renewal +2wk, +4wk, +6mo,
   i.e. ~15 Oct / ~29 Oct / ~1 Apr (§4a).** Renewal date = **1 October**; just
   confirm the exact day.
2. ~~Expiry date in the export?~~ **RESOLVED: no — the admin pastes just the
   email column, so reconcile is presence-based (§4).** (Trade-off: no
   "expiring soon" prompts, since there are no per-member dates.)
3. Plaintext (v1) or hashed (v1.1) email storage?
4. ~~Should `suspended` be set from this flow?~~ **DECIDED: `suspended` is set
   and cleared only from the app admin screen; import/reconcile never changes it
   in either direction (§6).**
5. ~~What can an aspirant do?~~ **DECIDED: 3 trial events, then join (Join-now
   opt-in any time).** Remaining sub-question: does a **trial** count on
   confirmed sign-up or on attendance, and does cancelling free a slot?
