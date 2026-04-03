# OtterPool — Product Specification v0.9

---

## Overview

A web and mobile app for Drumchapel and Clydebank Kayak Club (DCKC) covering full membership management, event creation and sign-up, a progressive experience and qualification system, automatic corroboration rights, Paddling Admin-grounded approval, and payment collection. The app owns its own member registry and is the authoritative record of club membership and paddling experience.

Built initially with realistic dummy data before any real member data is introduced.

---

## Member Types

### Aspirant Member
A person trying out the club before committing to full membership.

- Created by entering email + password, or Sign in with Google / Sign in with Apple
- Email verification required before proceeding
- Immediately shown a welcome screen explaining the 3-session trial
- Taken directly to the calendar after the welcome screen
- Can see all events — ineligible events greyed out with reason shown
- Can attend a maximum of 3 events
- Can pay for events (e.g. Tuesday evening £5)
- At first event signup: full name, DOB, and all ICE/medical fields required before place confirmed
- After 2nd event: automatic notification to member and Membership Admin
- After 3rd event: hard lock — popup explains limit reached, offers Join Now button. Join Now also visible earlier for those who want to convert immediately
- Treated as Frog on progression scale, can progress normally during trial

### Full Member
Paid-up club member. Full access to all events appropriate to their progression level.

**Membership options:**
- **Auto-renewing** — Stripe annual subscription, advance notice sent before each charge
- **Manual renewal** — annual payment, reminder sequence sent before expiry, hard lock on expiry with no grace period

**Membership types:** Full / Associate / Junior / Guest

### Member Status Values
Active / Aspirant / Lapsed / Suspended

---

## Membership Renewal

### Reminder Sequence

| Timing | Channel | Message |
|---|---|---|
| 4 weeks before expiry | Email + in-app | "Your membership renews on [date]" |
| 2 weeks before expiry | Email + in-app banner + push | Renew Now button included |
| 1 week before expiry | Email + push | More urgent tone |
| Day of expiry | Email | Final warning — locks at midnight |
| Day after expiry | Email + in-app | Confirmed lock, direct renewal link |

In-app banner visible from 2 weeks out until renewed.

### Auto-Renewing Members
Reminder sequence serves as advance notice of upcoming charge (required under UK recurring payment regulations). If charge fails, member notified immediately and dropped into manual reminder sequence. Account does not lapse until expiry date.

### On Expiry
Hard lock on expiry date. Cannot sign up for events. All profile data, experience log, tally history, corroboration records, and assessment answers fully preserved — lock is not destructive. Full access resumes immediately on renewal.

---

## User Roles

| Role | Responsible for | Kayaking expertise required |
|---|---|---|
| **Member** | Own profile and events | - |
| **Selkie** | Leading trips, approving applicants, recording attendance, viewing full member records | Yes — BC qualified |
| **Membership Admin** | Member accounts, data management, aspirant conversions, membership renewals | No |
| **Paddling Admin** | Setting approval ceilings, corroborating external experience, bulk onboarding assessments. Acts as master approver — reviews member dashboards and manually approves up to a given grade | Yes — highly experienced |
| **Super Admin** | Full system access, data export, all of the above | - |

Roles are independent and combinable.

---

## Onboarding Flow

### Step 1 — Account Creation
Email + password, or Sign in with Google / Sign in with Apple.
Email verification required before proceeding.

### Step 2 — Welcome Screen (Aspirant)
> "Welcome to DCKC. You can join us for up to three sessions before becoming a full member. Head to the calendar to find your first paddle."

Two buttons: **Browse Events** and **Join Now**.

### Step 3 — First Event Signup
Aspirant prompted to complete profile before place confirmed:

**Required:**
- Full name
- Date of birth
- Medical conditions & allergies
- Medication including location of medication
- ICE name(s)
- ICE telephone number(s)
- ICE email
- ICE address (optional)
- Alternative emergency contact name (optional)
- Alternative emergency contact telephone (optional)

**Optional:**
- Profile photo (prompted, not required — note encouraging an on-water photo shown)

**Consent required:**
- Emergency contact data shared with trip leader during event window
- Medical information visible to trip leader during event window

### Step 4 — Full Membership Conversion
Triggered by Join Now button or hard lock popup:
- Select membership type
- Choose auto-renewing or manual annual renewal
- Payment via Stripe
- Full member status granted immediately on payment

---

## Member Profile Fields

| Field | Visible to | Notes |
|---|---|---|
| Full name | All | Required at first event signup |
| Email | Self + Admins | Primary key and login credential |
| Phone | Self + Selkie + Admins | Optional |
| Date of birth | Self + Admins | Required at first event signup |
| BC membership number | Self + Admins | Optional but encouraged |
| Profile photo | All | Optional — prompted after first attended trip |
| Medical conditions & allergies | Self + Selkie (trip window) + Admins | Required at first event signup |
| Medication + location | Self + Selkie (trip window) + Admins | Required at first event signup |
| ICE name(s) | Self + Selkie (trip window) + Admins | Required at first event signup |
| ICE telephone number(s) | Self + Selkie (trip window) + Admins | Required at first event signup |
| ICE email | Self + Selkie (trip window) + Admins | Required at first event signup |
| ICE address | Self + Selkie (trip window) + Admins | Optional |
| Alternative ICE name | Self + Selkie (trip window) + Admins | Optional |
| Alternative ICE telephone | Self + Selkie (trip window) + Admins | Optional |
| Membership type | Self + Admins | Aspirant / Full / Associate / Junior / Guest |
| Membership status | Self + Admins | Active / Aspirant / Lapsed / Suspended |
| Renewal type | Self + Admins | Auto-renewing / Manual |
| Membership expiry date | Self + Admins | |
| App roles | Super Admin only | |
| Joined date | Self + Admins | |
| Years as member | Calculated | Aspirant period excluded |
| Trial events attended | Membership Admin + Super Admin | Aspirant only, counter 0-3 |
| Approval ceiling | Self (read only) + Paddling Admin + Super Admin | Per track — see Approval section |
| Admin notes | Admins only | |

### Medical and Emergency Info — Trip Visibility Window
Visible to event leader and designated assistant leaders from event start until midnight the following day. Server-side enforcement — not UI hiding only. Cannot be manually extended except by Super Admin.

### Profile Photo
Optional. Prompted after first confirmed attended trip:
> "Got a great shot from today? Add it as your profile photo."

Visible to all members. Used on leader approval screen. Basic moderation step required before going live — admin approval or automated screening.

---

## Progression Scale

Applies to kayaks only — open canoes and SUPs out of scope.

### Zone 1 — Internal Club Progression

| Level | Symbol | Description |
|---|---|---|
| **Frog** | 🐸 | New to kayaking. May not have done a capsize drill with spray-deck |
| **Duck** | 🦆 | Completed capsize drill with spray-deck in a kayak. Sit-on-top does not count. Effective minimum for most events |
| **Otter** | 🦦 | Can reliably perform and receive a rescue on the water using a heel hook. Craft-specific |
| **Dolphin** | 🐬 | Accomplished paddler. Can assist others informally. Not yet authorised to lead |

### Zone 2 — Selkie (Leaders)

🦭 **Selkie** — Club designation for any member holding a BC leadership qualification recognised by DCKC. Club-facing identity for all Zone 2 members regardless of specific qualification held.

**BC qualifications recorded:**

| Qualification | Track |
|---|---|
| Paddlesport Leader | General |
| Sea Kayak Leader (SKL) | Sea |
| Whitewater Leader (WWKL) | Whitewater |
| Advanced Sea Kayak Leader | Sea |
| Advanced Whitewater Leader | Whitewater |

Recorded as a flat list — qualification name, award date, confirming admin. Sea and whitewater tracks fully independent.

**BC qualification recording:**
1. Member submits evidence
2. Membership Admin or Super Admin confirms in person
3. Recorded with confirmation date and confirming admin
4. Status updated to Selkie

---

## Corroboration Rules

Rights flow automatically from qualification level. App verifies at submission and logs full audit trail: who, to what level, by whom, on what date.

### Zone 1 Transitions

| Transition | Witnesses required | Who can witness |
|---|---|---|
| Frog → Duck | 1 | Any Dolphin or Selkie |
| Duck → Otter | 2 | Any Paddlesport Leader or higher |
| Otter → Dolphin | 2 | Any SKL, WWKL, or Advanced equivalent |
| Dolphin → Selkie | BC assessment | External BC assessor, matching specialism |

### External Experience Import
1. Member submits experience narrative
2. Paddling Admin reviews and assigns Zone 1 level up to Dolphin
3. Logged as "externally corroborated" throughout
4. External grade trips added to tallies as a corroborated block, flagged separately from DCKC-logged trips

---

## Experience Log

Four independent tracks. None feed into each other.

### Track 1 — Sea Grade Tally
Sea A / Sea B / Sea C

### Track 2 — River Grade Tally
G1 / G1/2 / G2 / G2/3 / G3 / G3(4) / G4 / G4(5) / G4/5 / G5

Each confirmed trip increments exactly one counter. No weighting. Display example:
> G1 `II` · G1/2 `III` · G2 `IIIIII` · G3 `IIIIIIII` · G3(4) `I` · G4 `-`

### Track 3 — Pinkston Tally
P1 / P2 / P3 — separate from river grades. Pump level adjusted post-session to highest level reached.

### Track 4 — Membership Tenure
Calculated from join date. Aspirant period excluded.

### Log Entry Fields

| Field | Source |
|---|---|
| Event title | From event record |
| Event category | From event record |
| Date | From event record |
| Activity type | Sea / River / Pinkston / Coached session / Course |
| Grade / pump level (advertised) | Set at event creation |
| Grade / pump level (actual) | Set by leader post-event |
| Leader | From event record |
| Member post-trip response | Emoji + optional free-text line |
| Leader emoji for member | Leader's optional private note |
| Leader private notes | Selkies and Admins only |
| Entry type | DCKC trip / Externally corroborated / Admin manual entry / Pre-app import |
| Confirmed | Set true when leader marks attendance |

### Visibility

| | Member | Selkie / Admin |
|---|---|---|
| Own experience | Summary — tallies, tenure | Full log, all fields |
| Others | Not visible | Full log, all fields |

### Assessment Form Retirement
Once a member has approximately 12 confirmed attended trips logged, their trip record speaks for itself. At this point assessment form answers are retired from the approval view and flagged as "established member — trip record primary." Answers are retained in the system but no longer surfaced prominently.

### Historical Import
CSV bulk import by admins. All entries flagged as "pre-app import."

---

## Approval System

There is no algorithmic auto-approval formula. Approval is always a human judgement.

### How It Works
A Paddling Admin reviews a member's full dashboard — tally display, animal level, tenure, assessment form answers, corroboration history — and manually sets an approval ceiling per track. This is a considered decision made by a highly experienced leader who knows what the grades demand.

Once a ceiling is set, the system uses it to route sign-up requests:
- **At or below ceiling** → confirmed automatically when signing up (if leader has auto mode enabled for the event)
- **Above ceiling** → goes to leader for manual review

Leaders can override to Manual all for any event, requiring everyone to be reviewed.

The ceiling is a trust record, not an algorithm. It reflects a human expert's assessment of a member's readiness.

### Approval Ceiling per Member

| Track | Approved up to | Set by | Date |
|---|---|---|---|
| Sea | e.g. Grade B | Paddling Admin name | date |
| River | e.g. G3 | Paddling Admin name | date |
| Pinkston | e.g. P2 | Paddling Admin name | date |

Grade-specific and track-independent. Approval at Grade B sea says nothing about river or Pinkston.

### Participant List View

| Name | Level | Approval | |
|---|---|---|---|
| Anna MacLeod | 🦦 Otter | ✅ Ceiling — set by [Paddling Admin] | → |
| Jamie Reid | 🐬 Dolphin | ✅ Ceiling — set by [Paddling Admin] | → |
| Chris Murray | 🦆 Duck | ✅ Manual approval | → |
| Siobhan Daly | 🦆 Duck | ⚠️ Pending review | → |

Tapping any row opens the full member record:
- Photo, name, animal level, tenure
- Tally display across all tracks
- Approval ceiling per track — set by whom, when
- Chronological approval history
- All assessment form submissions (until retired at ~12 trips)

Available to leaders before, during, and after the event.

---

## Assessment Form

Served to members requiring manual leader review. Answers persist across all applications until retired at approximately 12 confirmed trips.

**Questions:**

1. How many years have you been paddling?
2. Where have your top paddles of all time been?
3. Where have you encountered your toughest conditions and describe what happened?
4. How confident do you feel in judging the Beaufort scale, sea state, or river grades?
   *(Self-rating: Not confident / Some understanding / Comfortable / Very confident — plus optional free text)*
5. What do you think makes a good paddling group?
6. Is there anything the leader should know about you before the trip?
7. What is your favourite group size of people to paddle with?

---

## Calendar and Event Discovery

### Calendar View
- **Default:** Chronological list view — event photo, title, category, date, grade, minimum level, places remaining, cost
- **Toggle:** Month grid view — events shown as dots on dates, tap to expand
- **Month jump selector:** Quick navigation without scrolling
- **Filtering:** By category, grade, minimum level, availability

### Visibility by Member Type

| Member type | Eligible events | Ineligible events |
|---|---|---|
| Aspirant | Fully visible, signable | Greyed out — reason shown |
| Full member | Fully visible, signable | Greyed out — reason shown |
| Lapsed | All greyed out — renewal prompt shown | - |

### Event Listing Card
- Event photo (leader uploads, or category default)
- Title and category
- Date, time, estimated duration
- Location
- Grade / pump level
- Minimum progression level
- Places remaining / Full / Waitlist available
- Cost (or Free)
- Leader name and photo

---

## Event Categories

| Category | Default min level | Notes |
|---|---|---|
| Tuesday Evening - Loch Lomond | Frog | Default weekly session, £5 |
| Tuesday Evening - All Away | Frog | Away variant, group splitting rules apply, £5 |
| Night Paddle | Duck | |
| Pinkston - 1 Pump | Duck | Pre-filled location: Pinkston Watersports Centre. Contact session leader before attending |
| Pinkston - 2 Pumps | Duck | Pre-filled location: Pinkston Watersports Centre. Contact session leader before attending |
| Pinkston - 3 Pumps | Duck | Pre-filled location: Pinkston Watersports Centre. Contact session leader before attending |
| Pool / Loch Sessions | Frog | |
| River Trip | Duck | River grade set separately |
| Sea Kayak - A Trip | Duck | |
| Sea Kayak - B Trip | Duck | |
| Sea Kayak - C Trip | Otter | |
| Second Saturday Paddle | Duck | Animal level read from member profile — no self-declaration required |
| Skills Sessions / MicroSessions | Frog | |
| Training / Qualifications | Frog | |

---

## Event Data Model

| Field | Notes |
|---|---|
| Title | |
| Category | From category list |
| Event photo | Leader upload or category default |
| Grade / pump level (advertised) | Set at creation |
| Grade / pump level (actual) | Set post-event, defaults to advertised |
| Date and time | Start + estimated end |
| Location | Text + optional map pin. Pre-filled for Pinkston |
| Meeting point | Separate field |
| Leader(s) | One or more Selkies |
| Assistant leader(s) | Optional — receive medical/emergency info access |
| Minimum progression level | Defaults per category, adjustable |
| Max participants | Hard cap — optional |
| Description | Rich text |
| Approval mode | Auto (uses ceiling) / Manual all |
| Payment amount | £0-200 |
| Payment timing | Immediate / Authorise + capture on approval |
| Status | Draft / Open / Full / Closed / Cancelled |

---

## Sign-up, Approval and Waitlist

### Sign-up Paths

**Path A — Within ceiling, free:** Confirmed immediately.

**Path B — Within ceiling, paid:** Stripe payment taken immediately → confirmed.

**Path C — Above ceiling or no ceiling set, free:** Assessment form served if fewer than ~12 trips on record → leader reviews full record + answers → approves or declines → member notified with optional explanation.

**Path D — Above ceiling or no ceiling set, paid:** Assessment form if applicable → Stripe Payment Intent created (authorised, not captured) → leader reviews → if approved: captured + confirmed / if declined: authorisation released + member notified.

### Stripe Authorisation Expiry
- **Day 4:** Email reminder sent to leader
- **Day 7:** Authorisation expires. Notification sent to member explaining response is taking longer than usual and reminding them that all leaders are volunteers

*Open policy question: does the place return to general availability at day 7, or remain pending?*

### Event Modification
If a leader needs to change key details (venue, grade, date) after members have signed up, a **Change of Plan** button is available in event management. Leader describes what has changed. All confirmed participants notified immediately and presented with:
- **Accept** — remain on the event under new terms
- **Withdraw** — leave the event, full automatic refund issued

### Waitlist
When an event is full, members can join the waitlist. When a place opens:

1. First waitlisted member notified by email + push
2. **5 hours** to accept or decline — active acceptance required from everyone regardless of approval ceiling (circumstances may have changed)
3. If accepted: within-ceiling members confirmed immediately and payment triggered / above-ceiling members enter normal approval flow with leader
4. If no response within 5 hours or declined: moves to next person on waitlist
5. Waitlist exhausted: place returns to general availability

**1 hour remaining** push notification sent to the member holding the current offer.

### Event Cancellation
Leader or Admin can cancel at any time:
- All confirmed participants notified immediately
- All payments automatically refunded in full via Stripe
- All Payment Intent authorisations released
- Group thread locked with cancellation notice pinned

---

## Away Day Group Composition

Applies to Tuesday Evening - All Away when group splits:

- Groups of 3-6 people
- Each group: at least two Otters **or** one Selkie
- No more than two Ducks per group
- Frogs must be with a Selkie

Surfaced as guidance. Automatic group assignment is Phase 3.

---

## Post-Trip Flow

All prompts sent at **7pm on the day of the event**.

**No prompts sent for events with fewer than 3 confirmed participants.**

### Member Prompt
> *"How was [Event Title]?"*
> 😁 🙂 🤨 😬 🙁
> *(optional)* Anything to add? `____________`

If no profile photo yet:
> "Got a great shot from today? Add it as your profile photo." *(optional, dismissible)*

### Anonymous Leader Feedback
Only sent for events with 3 or more confirmed participants. Structured agreement-scale questions, no free text:

- Was the plan clearly communicated before setting off?
- Did you feel the group was well matched to the conditions?
- Did you feel safe throughout?
- Was there anything the leader could have handled differently?

Results shown to leader as responses arrive — no minimum threshold. Aggregate only, no individual responses shown.

### Leader Prompt
- Tick / cross per participant (present / no-show)
- Optional emoji per participant (private, Selkies and Admins only)
- Adjust actual grade / pump level
- Optional private note per participant

Leader record is authoritative. No-show = log entry unconfirmed.

---

## Leader Dashboard

Selkies see a dedicated dashboard showing:
- Upcoming events they are leading, chronological
- Participant count vs cap
- Pending approvals requiring action
- Waitlist count per event
- Quick links to participant list and event management

---

## Communication

Event-scoped group thread only. No club-wide chat — WhatsApp handles general club communication.

- Text + file/image attachments
- Pinned messages (leader only)
- Push notifications (opt-in per event)
- Separate private thread for declined applicants

---

## Payment Architecture

Stripe handles all processing. Club must hold a verified Stripe account — set up before Phase 2 begins.

| Scenario | Stripe mechanism |
|---|---|
| Within ceiling, paid | PaymentIntent — immediate capture |
| Above ceiling, paid | PaymentIntent — authorise only, capture on approval |
| Declined | Release authorisation |
| Event cancelled | Automatic full refund, all participants |
| Change of Plan — member withdraws | Automatic full refund |
| Discretionary refund | Manual by Selkie or Admin |
| Cash | Admin marks "paid — cash" |
| Annual membership — auto-renew | Stripe subscription |
| Annual membership — manual | One-off PaymentIntent |
| Auto-renew charge failure | Immediate notification, manual reminder sequence begins |

---

## Data Export (Super Admin only)

- Full member list (CSV)
- Attendance records by date range (CSV)
- Experience logs by member or date range (CSV)
- Membership payment history (CSV)
- BC affiliation return data (CSV)

---

## GDPR Considerations

To be addressed before first real member data is introduced (not before initial dummy data build):

- **Lawful basis** — likely legitimate interests or contract for a membership organisation
- **Privacy notice** — what data is held, why, who sees it
- **Special category data** — medical information requires explicit consent and stronger protections
- **Third party data** — emergency contacts require particular care
- **Right to deletion** — members can request their data be deleted
- **Consent records** — consents given at signup must be logged and demonstrable
- **Data retention** — policy needed for lapsed members and aspirants who did not convert

ICO website provides plain-English guidance appropriate for a small non-profit club.

---

## Notifications

| Trigger | Channel |
|---|---|
| Account created | Email (verification) |
| Signup confirmed | Email + push |
| Placed in manual review | Email + push |
| Assessment form served | Email + push |
| Approval decision | Email + push |
| Payment captured | Email |
| Stripe authorisation — day 4 reminder | Email to leader |
| Stripe authorisation — day 7 expiry | Email + push to member |
| Event cancelled — refund issued | Email + push |
| Change of Plan — accept/withdraw prompt | Email + push |
| Waitlist place available | Email + push |
| Waitlist place — 1 hour remaining | Push |
| Waitlist place expired | Email |
| New group message | Push (opt-in) |
| Event reminder | Email + push, 24h before |
| Post-trip prompt | Email + push, 7pm day of event |
| Leader attendance prompt | Email + push, 7pm day of event |
| Aspirant — 2nd event attended | Email to member + Membership Admin |
| Aspirant — 3rd event attended | Email to member + Membership Admin, hard lock |
| Auto-approval ceiling set | Email to member |
| Membership expiry — 4 weeks | Email + in-app |
| Membership expiry — 2 weeks | Email + in-app banner + push |
| Membership expiry — 1 week | Email + push |
| Membership expiry — day of | Email |
| Membership expired | Email + in-app |
| Auto-renew successful | Email |
| Auto-renew failed | Email + push |

---

## Suggested Build Phases

### Phase 1 — Core (web only, dummy data)
Member registry (aspirant and full), onboarding flow, Google/Apple login, progression scale, event creation with categories, calendar view, open sign-up, basic group thread, manual attendance recording, experience log (all four tracks), BC qualification recording, leader dashboard, corroboration workflow.

### Phase 2 — Approval, Payment, Membership
Approval ceiling system (Paddling Admin assignment), manual review workflow, assessment form, Stripe integration (events + membership subscriptions), Change of Plan flow, waitlist with 5-hour claim window, post-trip feedback flow, anonymous leader feedback, email notifications, medical/emergency trip visibility window, membership renewal reminders, data export.

### Phase 3 — Mobile and Polish
React Native or PWA mobile app, push notifications, leader screens optimised for mobile, historical CSV import, away day group splitting assistant, profile photo moderation.

### Phase 4 — Intelligence
Approval ceiling suggestions based on trip history, experience-based sign-up guidance, club-level reporting dashboards.

---

## Key Technical Considerations

**1. Framework choice** — React (or Vue/Svelte) strongly recommended over plain JavaScript for an app of this complexity. Dynamic UI — live participant lists, approval states, notifications, tally displays — becomes very difficult to manage without a component framework. Decision should match developers' existing skills.

**2. Auth** — Managed auth provider (Supabase Auth, Firebase Auth, or Auth0) handles email/password + Google + Apple without building from scratch. Non-negotiable given the complexity of social login.

**3. Approval ceiling model** — Per-member, per-track, per-grade lookup table. Simple to query: does this member have a ceiling at or above this event's grade on this track? Yes/no.

**4. No approval algorithm** — The ceiling is set by a human (Paddling Admin) after reviewing the member dashboard. The system routes based on the ceiling. There is no scoring formula.

**5. Participant record view** — Aggregates profile, tally display, approval history, ceiling records, and assessment answers. Must load fast on mobile. Consider caching summary view.

**6. Waitlist clock** — 5-hour claim window requires reliable background job. Edge cases: member lapses during window, event cancelled during window, all waitlisted members decline.

**7. Auto-refund on cancellation** — Stripe refund triggered automatically. Must handle failed refunds (expired card etc.) — failed refunds alert admins immediately.

**8. Change of Plan flow** — Leader describes change, system notifies all participants, each must respond Accept or Withdraw within a reasonable window. Withdrawal triggers immediate refund. Consider what happens if a participant doesn't respond.

**9. Membership subscription** — Stripe subscription for auto-renew, one-off PaymentIntent for manual. Failed auto-renewal must notify immediately without lapsing account until expiry date.

**10. Medical info trip window** — Server-side time-based access. Opens at event start, closes midnight following day. No manual override except Super Admin.

**11. Post-trip job** — 7pm same-day trigger. Monitoring, retry logic, manual leader fallback. Skip entirely for events with fewer than 3 confirmed participants.

**12. Assessment form retirement** — At ~12 confirmed trips, answers retired from approval view. Retained in system but no longer surfaced. Threshold should be admin-configurable.

**13. GDPR** — Address before first real member data. Dummy data build is clean. See GDPR section above.

**14. Dummy data build** — Build and test entirely with realistic fake data. Plausible member profiles, tally histories, trip records, corroboration chains, approval histories across all event categories.

---

## Open Policy Questions

1. Stripe authorisation at day 7 — does the place return to general availability or remain pending indefinitely?
2. Change of Plan — what happens if a confirmed participant does not respond to the accept/withdraw prompt?
3. Data retention period for lapsed members and aspirants who did not convert
4. Assessment form retirement threshold — confirm ~12 trips or adjust

---

*Specification v0.9 — prepared for DCKC development team*
