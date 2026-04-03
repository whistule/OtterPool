# OtterPool

A kayak club management app prototype for [DCKC](https://dckc.co.uk) — Drumchapel and Clydebank Kayak Club, Glasgow.

Covers membership, event sign-up, progressive experience tracking, leader approval workflows, and emergency contact management.

---

## Screens

| Screen | Description |
|---|---|
| Calendar | Event browsing with discipline and grade filtering |
| Event Detail | Full event view with sign-up, participant list, group thread |
| Sign-up / Assessment | 7-question assessment flow for trip requests |
| My Trips | Upcoming confirmed trips and past trip log |
| Progress | Level, experience tallies, corroboration record |
| Levels Reference | Full level descriptions with craft control and rescue benchmarks |
| Leader Approval | Queue-based approval with member record, assessment and summary tabs |
| Participant List | Event attendees with ICE data access for leaders |
| Post-trip Feedback | Member emoji response, anonymous leader feedback, attendance recording |
| Profile | Personal details, ICE card management |
| Create Event | 6-step event creation flow |

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
- Sea Kayak Leader (SKL)
- Whitewater Kayak Leader (WWKL)
- Advanced SKL / Advanced WWKL

---

## Project structure

```
otterpool/
├── src/
│   ├── screens/
│   │   ├── otter-pool-calendar-v7.html
│   │   ├── otter-pool-event.html
│   │   ├── otter-pool-create-event.html
│   │   ├── otter-pool-my-trips.html
│   │   ├── otter-pool-progress.html
│   │   ├── otter-pool-levels.html
│   │   ├── otter-pool-approval.html
│   │   ├── otter-pool-participants.html
│   │   ├── otter-pool-posttrip.html
│   │   ├── otter-pool-profile.html
│   │   └── otter-pool-signup.html
│   └── otter-pool-app.html        ← router shell
├── dist/
│   └── otterpool.html             ← combined single-file build
├── combine.py                     ← build script
└── README.md
```

---

## Running locally

Open `dist/otterpool.html` directly in any browser. No server required.

---

## Building

After editing any screen file, regenerate the combined build:

```bash
python3 combine.py
```

Requires Python 3.6+. No external dependencies.

---

## Hosting on GitHub Pages

1. Push the repo to GitHub
2. Go to **Settings → Pages**
3. Set source to **Deploy from branch → main → /dist**
4. Your app will be live at `https://yourusername.github.io/otterpool/`

---

## Design

**Typography:** Fraunces (display) + Source Serif 4 (body)

**Colour palette:**

| Role | Colour |
|---|---|
| Topbar / nav | `#2a4560` slate navy |
| Sea grades | `#00c8b4` / `#0098a0` / `#005a6e` teal range |
| River grades | `#58d048` / `#28a030` / `#0a5018` green range |
| Pinkston | `#d4703a` / `#b85530` / `#8a2e10` burnt orange range |
| ICE / emergency | `#8a1a1a` deep red |
| Forest / UI chrome | `#2c4a2e` |

**Composure scale** (leader private emoji per participant):

😁 Relaxed · 🤨 Focused · 😬 Stretched · 😨 Out of depth · 😱 Struggling

---

## Status

Prototype — HTML/CSS/JS, no backend. All data is illustrative dummy data.

**Screens complete:** All 11 screens built and linked.

**Not yet built:**
- Authentication / onboarding flow
- Backend (suggested: Supabase + Stripe)
- Real data layer

---

*Built for DCKC, Glasgow · 2025*
