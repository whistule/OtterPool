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
  membership_year int,                 -- or expiry date, whichever the export gives
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

---

## 4. Import flow

1. Membership secretary exports verified-member emails from MemberMojo (CSV).
2. An **admin-only import** (edge function or script — the repo already has
   seed/admin tooling under `supabase/`) loads the CSV:
   - normalise each email (`lower(trim)`),
   - **replace** the table contents (truncate + insert, in a transaction) so the
     table always reflects the latest export,
   - record the import (who, when, row count) for traceability.
3. Immediately run the **reconcile** (§6) so statuses reflect the new list.

**Cadence:** membership is continuous, not annual — people join and lapse
mid-year. A yearly refresh means someone who lapses in month 2 keeps access for
10 months. **Recommend monthly or quarterly** re-export/import. Annual is a
viable *starting* cadence only if the club accepts that staleness.

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

**Never downgrade `aspirant`, `suspended`, or trial members** via reconcile —
absence from the paid list is their *normal* state (see §8).

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

## 9. What this deliberately does NOT do

- No renewals, payments, Gift Aid, or member comms — all stay in MemberMojo.
- No full in-app membership management — that's a separate strategic decision.
- Does not affect the ICE new/existing split (account-age based).

---

## 10. Implementation checklist (for when approved)

- [ ] `verified_members` table + RLS (service-role only)
- [ ] `profiles.membership_source` column (`list` / `manual`)
- [ ] Admin CSV import (normalise, replace-in-transaction, record import)
- [ ] Match-on-account-creation → set `active` / leave `aspirant`
- [ ] Reconcile function: upgrade + downgrade, skip `manual` / `aspirant` /
      `suspended`
- [ ] Confirm Supabase email verification is enabled
- [ ] e2e coverage: matched email → active + can sign up; unmatched → aspirant;
      lapsed after reconcile → blocked; manual override survives re-import
- [ ] Decide cadence (recommend monthly/quarterly) and who runs the import
- [ ] Optional: hashed-email hardening (§7 v1.1)

**Rough effort:** small–medium. Most of the gate and status machinery already
exists; the new work is the table, import, and reconcile.

---

## 11. Open questions for the club

1. Import **cadence** — monthly / quarterly / annual? Who owns it?
2. Does the export carry an **expiry date** per member, or just "verified this
   year"? (Affects whether reconcile can be date-driven rather than
   presence-driven.)
3. Plaintext (v1) or hashed (v1.1) email storage?
4. Should `suspended` ever be set from this flow, or only ever by an admin?
