# OtterPool — ICE (Emergency Contact) Design (Proposal)

**Status:** Proposal · review-only · nothing implemented
**Scope:** Two linked pieces of the Phase-1 safety work —
(1a) make ICE mandatory so the data reliably exists, and
(1b) let a trip leader see it safely on the water, including offline.
**Date:** 2026-09-21

---

## 1. Background & verified current state

"ICE" = In Case of Emergency: a member's medical/allergy info, mobile, and
next-of-kin contacts. Two tables already hold this:

- **`member_private`** — `phone`, `dob`, `bc_membership_no`, **`medical_notes`**
- **`emergency_contacts`** — `name`, `relationship`, `phone`, `email`, `address`,
  `is_primary`

**Current RLS (verified in the migrations):** both are readable only by **self**,
**super admin** (`is_admin`), and **membership admin** (`is_membership_admin()`).
A **trip leader gets nothing today** — not medical, not mobile, not next-of-kin.
`paddling_admin` was deliberately not granted read either.

The original authors **explicitly deferred** the leader case. Both migrations
say so:
> *"Trip-window visibility for selkies/leaders is also deferred: round one is
> self+admin only."*

So 1b is *finishing a documented, intended piece* — not fighting the model.

**Relationship to membership:** independent. The ICE new/existing split (§3)
keys off OtterPool account age, not membership status or the MemberMojo list.

---

## 2. The two pieces (and why this order)

- **1a — Mandatory ICE at first event sign-up.** Makes the data exist.
- **1b — Leader trip-window ICE access.** Exposes it safely, incl. offline.

**Build 1a before 1b** — there's no point giving leaders access to ICE records
that are mostly empty.

---

## 3. 1a — Mandatory ICE at first event sign-up

### Decisions

- **Gate at first _event sign-up_, not account creation.** Matches the spec
  (`§122` note in the migrations), keeps onboarding open, and avoids collecting
  medical data from people just browsing.
- **Require the safety subset only:**
  - **Required:** medical/allergies (even "none"), member **mobile**, ≥1
    emergency contact with **name + phone**.
  - **Optional:** home address, email, DOB — the fields leaders never see anyway.
- **New vs existing keyed off OtterPool account age**, not membership:
  - **New** (account created after rollout, or `aspirant`) → **hard gate**:
    can't sign up for a first event until ICE is complete. (Completing ICE on
    first use is exactly what we want.)
  - **Existing** (had an account before rollout) → **grace period** (Option A):
    can still sign up, but see a persistent "Complete your ICE by **[date]**"
    prompt; after the deadline the same hard gate applies. No one is blocked on
    day one; everyone converges; the branch self-deletes after the deadline.

### Enforcement

**Server-side, in the `sign-up` edge function** — never just the React form
(a form-only check is cosmetic, the same trap as the prototype). The function
already has a guard block (`lapsed` / `suspended` / `meetsLevel`); the ICE check
slots in as one more early-return there, using the `admin` client (so it can
read `member_private` / `emergency_contacts` regardless of RLS).

### The shared `ice_complete` predicate

One definition, reused by the gate *and* the leader-side "chase this member"
warning:

```
ice_complete(member_id) :=
  member has medical_notes answered (non-null; "none" is valid)
  AND member has ≥1 emergency_contacts row with name AND phone
```

Best as a `SECURITY DEFINER` SQL function (mirroring `is_membership_admin()`),
so both the edge function and any RLS/UI check call the same rule.

### Care points

- The `sign-up` function has `pending_payment` re-entry branches — place the
  gate early enough not to block someone **mid-payment** or double-gate a
  returning row.
- Define the grace **deadline** (a season boundary or ~2–3 months).

---

## 4. 1b — Leader trip-window ICE access

### The core decision: no direct table access for leaders

RLS is **row-level** — grant a leader `SELECT` on an `emergency_contacts` row and
they get *every* column, **including home address**. To keep address (and email,
DOB, BC number) out **by construction**, leaders never get direct table access.
Instead they read a **minimised projection** through a `SECURITY DEFINER`
function. Self + membership-admins keep their existing full-row access unchanged.

**What a leader sees vs. doesn't:**

| Included | Excluded from leaders |
|---|---|
| Member name, level | 🚫 **Home address** |
| Member mobile | 🚫 Email |
| Medical & allergies | 🚫 Date of birth |
| ICE contact: name, relationship, phone | 🚫 BC membership no. |
| `ice_complete` flag (drives the "chase" warning) | 🚫 Any non-confirmed / non-participant |

### Proposed SQL (draft — not applied)

```sql
-- 1. Is the caller the leader of this event, within its window?
create or replace function public.can_view_event_ice(p_event_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and e.leader_id = auth.uid()
      and e.status <> 'cancelled'
      -- window: 12h before start -> end of the event's last day (tunable)
      and now() >= e.starts_at - interval '12 hours'
      and now() <  date_trunc('day', coalesce(e.ends_at, e.starts_at))
                   + interval '1 day'
  );
$$;
revoke all on function public.can_view_event_ice(uuid) from public, anon;
grant execute on function public.can_view_event_ice(uuid) to authenticated;

-- 2. Minimised ICE for CONFIRMED participants of an event.
--    One row per (participant, contact); app groups by member_id.
--    The SELECT list is the whole privacy control: NO address/email/dob/bc.
create or replace function public.event_ice(p_event_id uuid)
returns table (
  member_id            uuid,
  member_name          text,
  member_level         int,
  member_mobile        text,   -- from member_private.phone
  medical_notes        text,
  ice_complete         boolean,
  contact_name         text,
  contact_relationship text,
  contact_phone        text,
  contact_is_primary   boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_view_event_ice(p_event_id) then
    raise exception 'ICE access is limited to the trip leader during the event window'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.admin_audit_log (actor_id, target_id, target_type, action)
  values (auth.uid(), p_event_id, 'event', 'view_ice');   -- log the access

  return query
  select p.id,
         coalesce(p.display_name, p.full_name),
         p.level,
         mp.phone,
         mp.medical_notes,
         exists (select 1 from public.emergency_contacts c where c.member_id = p.id),
         ec.name, ec.relationship, ec.phone, ec.is_primary
  from public.event_signups s
  join public.profiles p              on p.id = s.member_id
  left join public.member_private mp   on mp.member_id = p.id
  left join public.emergency_contacts ec on ec.member_id = p.id
  where s.event_id = p_event_id
    and s.status = 'confirmed'
  order by p.full_name, ec.is_primary desc nulls last;
end;
$$;
revoke all on function public.event_ice(uuid) from public, anon;
grant execute on function public.event_ice(uuid) to authenticated;
```

The `left join` means a confirmed member with **no** contacts still returns a
row with `ice_complete = false` — which powers the "not completed ICE card,
chase before departure" warning for free.

### Tunable knobs
- **Window** — drafted *12h before → end of the event's last day*; the prototype
  said "until midnight tonight." Adjust the two `interval` lines.
- **Email** — excluded by default (only address was explicitly vetoed); one line
  to add back if leaders want it.
- **Scope** — whole-event; add `p_member_id` for a single-participant lookup.
- **Confirmed only** — waitlisted/pending excluded (correct for a waterside
  headcount).

### Known limitation
`events` has a **single `leader_id`** → **co-leaders/assistants get nothing**.
Acceptable for v1; flag it.

### Design freeze
No new `SELECT` policy is added to `emergency_contacts` / `member_private` —
they stay **self + admin** at the row level. That's what guarantees address
can't leak to a leader even via a direct table call.

---

## 5. Offline availability (the real risk) — cache it

**The problem:** server-gated ICE is unreachable in exactly the remote
sea/river/loch spots where an emergency is most likely and there's no signal.
The prototype hedges: *"collect physical ICE cards at the put-in — digital is a
backup."*

**The answer: cache the minimised payload on the device.** Mechanically simple —
the app already has `@react-native-async-storage/async-storage` and
`expo-file-system` (no new infra for a basic version). Flow:

1. Leader opens the trip **while on signal** → app calls `event_ice(event_id)`,
   writes the payload to local storage.
2. **On the water, no signal** → the sheet reads from the cache.

It's *slightly* more than a dumb cache only because of what it holds (medical +
a phone). Three cheap habits, two free:

- **Time-box + purge** (free): cache only for the event window; delete on window
  close and on sign-out. Not medical data lingering forever.
- **Carry the expiry _in_ the payload** (free): can't ask the server offline
  whether the window's open, so the cache self-expires. (The one bit of genuine
  logic beyond a plain cache.)
- **Encrypt at rest** (one small dep, `expo-secure-store` for the key):
  recommended for health data, but *optional for v1* since the projection
  already excludes address/DOB/email — the cache holds only medical + a phone,
  on a passcode-locked phone.

### Optional refinement — two-packet split (pseudonymisation)
Separate identity from the sensitive attributes:
- **Packet A — roster** (member_id → name, level): not sensitive; cache plain.
- **Packet B — sensitive** (member_id → medical, ICE phone): **encrypted at
  rest**, key in the keychain, joined to A only in memory at display.

Reduces breach harm on a *partial* leak / locked-phone dump (Packet A = names,
Packet B = useless ciphertext). But note: its protection comes from **encrypting
Packet B**, not the split itself — the device must hold the join to be useful
offline, so a fully-compromised unlocked phone re-links them regardless. So it's
a v1.1 hardening, not a prerequisite.

### What caching does NOT fix
A **flat/lost/broken phone**. That's why **paper stays primary** and digital is
the backup — defence in depth, not either/or.

### Recommended offline path
- **v1:** plain, time-boxed, auto-purged cache of the minimised payload (deps
  already in the project).
- **v1.1:** encrypt the cache (key in keychain); optionally split roster/medical.
- **Always:** paper cards at the put-in remain the guaranteed primary.

---

## 6. Risk summary

| Risk | Severity | Mitigation |
|---|---|---|
| Offline unreachable in an emergency | High (product) | Cache + paper primary |
| `SECURITY DEFINER` guard bug leaks data | Medium | **Minimised projection** — even a bug can't leak address/email/DOB; plus tests |
| Event window closes mid-overrun trip | Medium | Generous window + a manual "extend"; UTC maths |
| Cached medical on a lost/stolen phone | Medium | Time-box + auto-purge; encrypt (v1.1); device lock |
| Co-leader/assistant gets nothing | Low | Known v1 limitation |
| Audit log itself is sensitive / noisy | Low | Protect it; consider throttling to once/session |
| Special-category data + consent (GDPR) | Medium | Consent notice at collection; data minimisation (already) |

**Overall:** small, contained code on both pieces (the data model, the guard
insertion point, and the e2e harness already exist). The residual risks are
privacy-guard correctness (bounded by the minimised projection + tests) and the
offline story (a product decision, not a code blocker). **High review bar** —
both touch the most sensitive data + a safety function, so they warrant a
security review and real e2e coverage despite modest diffs.

---

## 7. Implementation checklist (for when approved)

**1a — mandatory ICE**
- [ ] `ice_complete(member_id)` `SECURITY DEFINER` predicate
- [ ] Rollout flag/date for new-vs-existing (account-age based) + grace deadline
- [ ] Gate in the `sign-up` function (early return; mind `pending_payment` re-entry)
- [ ] "Complete your ICE" CTA / deep-link on a blocked sign-up
- [ ] Existing-member grace banner with deadline
- [ ] e2e: no ICE → blocked (new) / warned (existing); complete → proceeds

**1b — leader access**
- [ ] `can_view_event_ice(event_id)` + `event_ice(event_id)` functions (one migration)
- [ ] Leader ICE sheet UI (copy the prototype's layout; red styling; call button uses stored number)
- [ ] "Chase this member" warning driven by `ice_complete`
- [ ] Audit `view_ice` writes
- [ ] e2e: leader-in-window sees subset; non-leader / out-of-window → exception;
      **address never present**

**Offline (§5)**
- [ ] Prefetch `event_ice` on trip open while online
- [ ] Time-boxed cache with in-payload expiry + auto-purge
- [ ] v1.1: encrypt at rest (`expo-secure-store` key); optional roster/medical split

---

## 8. Open questions / to confirm

1. **Event window** exact bounds (drafted 12h-before → end of last day) and
   whether leaders can manually **extend** for an overrunning trip.
2. **Grace deadline** length for existing members (season boundary vs ~2–3 mo).
3. **Co-leader/assistant** access — accept single-leader for v1, or add assistants?
4. **Offline hardening level** for v1 — plain time-boxed cache, or encrypted from
   the start?
5. **Email** in the leader view — keep excluded, or include it?
6. **Consent** — add an ICE-sharing consent notice at collection? (GDPR
   special-category.)
7. **Audit throttling** — log every `view_ice`, or once per session?
