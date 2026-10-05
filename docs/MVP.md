# OtterPool MVP

The MVP is the smallest app the club can run its trips on: members find a
trip, sign up and pay, and the leader knows who is coming. Everything in
`DCKC-Platform-Spec-v0.9.md` that isn't listed under "In" is post-MVP.

## The test for anything new

A change is MVP only if, without it, a trip can't run or a member can't sign
up and pay. Everything else goes on the post-MVP list below, however good an
idea it is.

Built extras stay, but only get fixes when they break. Changes and extensions
to them are post-MVP.

## In

- [x] **Accounts:** sign-up, sign-in, password reset.
- [x] **Calendar:** list of upcoming trips.
- [x] **Events:** create, edit, cancel, with a minimum level and a price.
- [x] **Sign-up:** auto-confirm or leader review per event, Stripe payment,
      withdrawing.
- [x] **Refunds:** done by hand in Stripe when a trip is cancelled or a paid
      member withdraws.
- [x] **My Trips:** a member's upcoming trips.
- [x] **Leaders:** review sign-ups, see who is going.
- [x] **Levels:** set by paddling admins, checked against an event's minimum.
- [x] **Push notifications:** sign-ups to the leader, review decisions and
      cancellations to the member.
- [x] **Admin:** member roles.
- [ ] **Leaders can remove someone from their trip.** Only an admin can
      today.
- [ ] **Leader notified of paid auto-confirmed sign-ups.** These go through
      Stripe checkout and the leader currently gets no push at any point.
- [x] **GDPR basics,** before real member data goes in:
  - [x] Stop collecting medical details and emergency contacts, and delete
        what is already held. Medical data is special category data under
        GDPR and needs explicit consent and stronger protection, and the
        club collects it on paper anyway.
  - [x] A privacy notice: what is held, why, who sees it, and how long it
        is kept for lapsed members and non-members who never joined.
  - [x] Deleting a member's data on request. An admin doing it by hand is
        fine. See `data-deletion.md`.

## Built extras

- MemberMojo membership check and list import, and the 3-trip trial for
  non-members that depends on it.
- Repeating series.
- Below-level requests to the leader, and the paddling experience
  questionnaire.
- Waitlist.
- Calendar search and filters.
- Kit lists.
- Profile and event photos.
- Category defaults for level and price.
- Push for new trips in subscribed categories.
- Progress tab and trip tallies.
- Levels reference screen.
- Assistant leader on events.
- Price tiers.
- Member directory.

## Not in the MVP

Emergency contacts and medical details are collected on paper at the
waterside, not in the app. The app is not an emergency data source, as it
can't be relied on being up or having signal when it matters.

Post-MVP, roughly in spec order:

- Email notifications, membership renewals and subscriptions (MemberMojo
  handles membership).
- Post-trip flow: attendance, actual grade, member emoji, anonymous leader
  feedback.
- Corroboration and witnessing, per-track approval ceilings, assessment form
  retirement.
- Event group thread (WhatsApp covers this), Change of Plan, the 5-hour
  waitlist claim window, Stripe authorise-then-capture.
- Leader dashboard.
- Leader private notes, the composure scale, written member summaries with
  endorsements, asking the member a question from the approval screen.
- BC qualification recording, the Leadership tab and trips led.
- Membership types (Associate, Junior, Guest), membership import reminders.
- Featured events, saved club locations, previous trips on a route.
- CSV data export, month-grid calendar, car sharing, what3words, away-day
  group splitting, photo moderation, historical import, Google and Apple
  sign-in.
