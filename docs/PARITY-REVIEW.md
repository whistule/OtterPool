# OtterPool — HTML Prototype → Expo App Parity Review

_Read-only review. Compares the functionally-rich HTML prototype in `docs/`
(the design/behaviour reference) against the Expo React Native app in
`apps/mobile/` (the real build on a Supabase backend)._

_Date: 2026-06-27 · Branch: `claude/otterpool-mvp-review-50atid`_

---

## The headline

The two versions have effectively traded places:

- **HTML prototype** — broad and feature-rich. Every screen shows its full
  intended behaviour, but all data is faked and there is no backend.
- **Expo app** — deep but narrower. It has a real Supabase backend the
  prototype never had (auth, Stripe payments, RLS, granular roles, audit log,
  push notifications), but is still missing whole areas of the prototype's
  functionality and UI richness.

So this is **not** a pure regression: the Expo app is ahead on infrastructure
and several flows, but behind on breadth of features and screen polish.

---

## Parity scorecard

| Screen | Parity | State |
|---|---|---|
| Profile | ~85% | Details + ICE contacts at/above prototype; missing ICE-card lifecycle (consent/expiry/renewal), BC quals list, membership metadata |
| Event Detail | ~55% | Core info + far richer sign-up/payment done; missing equipment, car-sharing, route history, **group thread**, what3words |
| Create Event | ~55% | Data capture solid (+series); missing 6-step wizard, map/saved-locations+w3w, kit-template engine, featured toggle, review step |
| My Trips | ~45% | Data wired; missing tabs, imagery, who's-going, countdown, **cancel/refund**, tally visualisation |
| Calendar | ~45% | List + search solid; missing **month grid**, grade sub-filters, featured cards, avatar stacks, results count |
| Progress | ~50% | Followership half present (simplified); **entire Leadership tab + corroboration/witnessing missing** |
| Participants | ~30% | Basic listing; **leader's waterside ICE toolkit missing** |
| Notifications | ~40% | Push plumbing real (+diagnostics); preference depth shallow — no per-grade groups, multi-lead reminders, message/digest prefs |
| Approval Questionnaire | ~15% | Only bare confirm/deny; **7-Q assessment, scoring, "Ask…" path, summaries missing** |
| Levels Reference | ~15% | No standalone screen; only level vocab + ladder widget inside Progress |
| Post-trip | ~5% | **Effectively unbuilt** — no member emoji, anonymous feedback, attendance, grade adjustment, composure |

_Percentages are indicative, based on feature coverage of each prototype screen._

---

## Prioritized gaps

### 🔴 Tier 1 — safety / core loop missing or stubbed

1. **Leader ICE access during events** — the prototype's single most important
   safety feature. Emergency-contact _data_ exists, but it's gated to
   membership-admins, not trip leaders; there's no event-window ICE sheet,
   one-tap call, or ICE-incomplete warnings. _(Participants screen)_
2. **Post-trip flow** — entirely unbuilt. No attendance marking, no leader
   grade-adjustment report (a `grade_actual` column exists but nothing writes
   it), no member response, no composure capture.
3. **Approval questionnaire & scoring** — sign-up sends at most a free-text
   note; the 7-question assessment, auto-approval thresholds/reasons, and the
   "Ask a question" decision path don't exist.

### 🟠 Tier 2 — defining UX of major screens

4. **Calendar month grid + grade sub-filters** — currently a filtered list,
   not a calendar.
5. **My Trips cancel/withdraw with refund logic** — no cancel action at all on
   that screen.
6. **Progress Leadership tab + corroboration/witnessing** — BC qualifications,
   trips-led, and the entire witness/corroboration record are absent.
7. **Create-event kit-template engine + map/saved-locations (what3words)** —
   the prototype's most distinctive authoring features.

### 🟡 Tier 3 — engagement & polish

8. **Event group thread / messaging** — not built (no `messages` table, no
   chat UI). The prototype mocks a thread with pinned message, reply bar, and
   locked state. _Note: the message/digest notification prefs depend on this._
9. Car sharing, equipment accordion, "previous trips on this route"
10. Featured event cards, participant avatar stacks, results counts
11. Standalone Levels reference screen (zones, per-craft capabilities,
    aspirant card)
12. ICE-card lifecycle (consent, 12-month expiry, renewal reminders);
    BC-qualifications list on profile
13. Admin role-filter chips; the BC-qualification permission picker
    (PSL/CL/SKL/WWKL/AWKL), currently re-modelled as approval ceilings

---

## Where Expo has gone *beyond* the prototype

No prototype equivalent exists for any of these — they are net additions:

- **Stripe payments** + a full sign-up state machine (pending / held /
  confirmed / waitlist / cancel)
- **Granular admin roles** (Membership / Paddling / Super) with RLS and a real
  **audit log**
- **PII / medical data model** + emergency-contact CRUD (`member_private`,
  `emergency_contacts`)
- **Event series** (repeat creation, per-occurrence vs whole-series edit scope)
- **Real push registration + diagnostics** (`user_push_tokens`, push check)
- **Fuzzy photo reuse** across similar events (pg_trgm)
- **Search** on the calendar and member directory

---

## Caveats on the comparison

Two prototype "screens" don't map cleanly and are best read as **net-new work**
rather than "fix the existing screen":

- The prototype's **`signup.html` is a _trip-join application_** (a 7-question
  paddling-experience form gated by ICE) — not account creation. The Expo
  `sign-up.tsx` is account creation, a different job.
- The prototype's **`posttrip.html`** has no Expo counterpart at all.

---

## Key files referenced

- Calendar: `apps/mobile/app/(tabs)/index.tsx`
- Event detail: `apps/mobile/app/event/[id]/index.tsx`
- Sign-up review (leader): `apps/mobile/app/event/[id]/review.tsx`
- Create / edit event: `apps/mobile/components/event-form.tsx`,
  `apps/mobile/app/event/new.tsx`, `apps/mobile/app/event/[id]/edit.tsx`
- My Trips: `apps/mobile/app/(tabs)/my-trips.tsx`
- Progress: `apps/mobile/app/(tabs)/progress.tsx`,
  `apps/mobile/lib/progress.ts`, `apps/mobile/components/progress-blocks.tsx`
- Profile: `apps/mobile/app/(tabs)/profile.tsx`,
  `apps/mobile/app/profile/[id].tsx`
- Notifications: `apps/mobile/app/(tabs)/notify.tsx`,
  `apps/mobile/lib/notifications.ts`
- Admin / members: `apps/mobile/app/members.tsx`, `apps/mobile/lib/audit.ts`
- Backend: `supabase/migrations/`, `supabase/functions/`
- Prototype reference: `docs/otter-pool-*.html`, `docs/otterpool.html`
