# OtterPool v1.3.12

A kayak club management app prototype for [DCKC](https://dckc.co.uk) — Drumchapel and Clydebank Kayak Club, Glasgow.

Covers membership, event sign-up, progressive experience tracking, leader approval workflows, notification preferences, and emergency contact management.

---

## Screens

| Screen | Description |
|---|---|
| Calendar | Event browsing with discipline tabs (Sea, River, Pinkston, Loch/Pool, Skills) and grade filtering. Compact event cards with inline avatars, grades, prices. Featured cards for sea/river trips with descriptions and leader info |
| Event Detail | Full event view with hero image, key info, participant strip, accordions, request to join button |
| Approval Questionnaire | 7-question assessment flow for trip requests. Pre-filled answers with edit/resubmit/clear options |
| My Trips | Upcoming confirmed trips and past trip log with experience tally |
| Progress | Current level card with journey ladder, stat row, grade grids (sea/river/Pinkston), corroboration record. Leadership tab with BC qualifications, trips led, event permissions, extended remit evidence. Witnessing flow to help others progress. Privacy note |
| Levels Reference | Full level descriptions with craft control and rescue benchmarks |
| Notifications | Push notification settings — subscribe to trip types by grade, event reminders (1 month/week/day/hour), message preferences with daily digest option. Leader/event changes always on |
| Admin | Member directory with search and role filters (Active/Aspirants/Leaders/Expired). Member management sheet with club role dropdown, event permission levels (PSL/CL/SKL/WWKL/AWKL), level override |
| Supermentor | Approvals dashboard, extended remit tracking, member lookup |
| Leader Approval | Queue-based approval with member record, assessment and summary tabs |
| Participant List | Event attendees with ICE data access for leaders |
| Post-trip | Member emoji response, anonymous leader feedback, leader trip report with grade adjustment (A/A+/B/B+/C/C+), "everyone attended and coped well" quick action, per-participant composure and notes |
| Profile | Personal details, ICE card management, leaving the club options (email data & leave / leave & keep data / leave & delete all) |
| Create Event | 6-step event creation flow with category selection (Sea A/B/C, River, Pinkston, Tue Evening Loch/Pool, All Away, Microsession, Skills, 2nd Saturday, Training) |

---

## Dashboard

The home screen serves as a dev/demo directory for accessing all screens. Three role views accessible via toggle bar:

- **Admin** — member directory and management
- **Supermentor** — approvals, extended remit, member oversight
- **Web Dev** — all screen templates for development

The OtterPool wordmark is clickable on any screen to return to the dashboard.

---

## Permission model

**Event permissions** are set by default from BC qualifications:

| Qualification | Default permissions |
|---|---|
| No qualification | Cannot create events |
| Event organiser | Non-paddling events (socials, meetings) |
| Paddlesport Leader | Loch/Pool sessions, Tuesday evenings, All Away trips |
| Coastal Leader | All PSL + Sea A and Sea B trips |
| Sea Kayak Leader | All CL + Sea C expeditions |
| WW Kayak Leader | River trips up to Grade 3(4) |
| Advanced WWKL | River trips up to Grade 4 |

A supermentor can extend someone's remit beyond their default qualification. Extended members appear on the supermentor dashboard with evidence trail.

---

## Progression system

Zone 1 — internal club progression:

| Level | Animal | Description |
|---|---|---|
| 1 | 🐸 Frog | New to kayaking |
| 2 | 🦆 Duck | Completed capsize drill with spray-deck |
| 3 | 🦦 Otter | Reliable on-water rescue using heel hook |
| 4 | 🐬 Dolphin | Accomplished paddler, can assist others |

Zone 2 — British Canoeing qualifications, all represented as 🦭 Selkie:

- Paddlesport Leader
- Coastal Leader
- Sea Kayak Leader (SKL)
- Whitewater Kayak Leader (WWKL)
- Advanced SKL / Advanced WWKL

Witnessing: Members can witness progression steps for others, provided they are 2+ levels above the person being witnessed.

---

## Project structure

```
OtterPool/
├── otterpool.html              ← combined single-file app (source of truth)
├── otter-pool-*.html           ← individual screen files (legacy, pre-combine)
├── combine.py                  ← build script (legacy)
├── files.zip                   ← asset archive
├── supabase/                   ← database config
├── DCKC-Platform-Spec-v0.9.md  ← platform specification
└── README.md
```

---

## Running locally

Open `otterpool.html` directly in any browser. No server required.

---

## Design

**Typography:** Fraunces (wordmark) + Plus Jakarta Sans (headings, body, UI)

**Emoji:** Noto Color Emoji via Twemoji replacement

**Colour palette:**

| Role | Colour |
|---|---|
| Topbar / nav | `#2a4560` slate navy |
| Sea grades | `#00c8b4` / `#0098a0` / `#005a6e` teal range |
| River grades | `#58d048` / `#28a030` / `#0a5018` green range |
| Pinkston | `#d4703a` / `#b85530` / `#8a2e10` burnt orange range |
| Loch / Pool | `#5a7080` |
| Role toggle | `#b85530` burnt orange |
| ICE / emergency | `#8a1a1a` deep red |
| Forest / UI chrome | `#2c4a2e` |

**Bottom nav:** Calendar, My Trips, Progress (current level emoji), Notify, Profile

**Composure scale** (leader private emoji per participant):

😁 Relaxed · 🤨 Focused · 😬 Stretched · 😨 Out of depth · 😱 Struggling

---

## Status

Prototype v1.3.12 — HTML/CSS/JS, no backend. All data is illustrative.

**Screens complete:** 14 screens built and linked.

**Not yet built:**
- Homescreen preference — default calendar filter by sea grade (A/B/C) or river grade (G1–G5) so users land on the trips most relevant to them
- Authentication / onboarding flow
- Membership renewal popup variants (aspirant/expiring/expired)
- Backend (suggested: Supabase + Stripe)
- Real data layer
- React migration

---

*Built for DCKC, Glasgow · 2025–2026*
