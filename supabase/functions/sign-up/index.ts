import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { createClients } from '../_shared/supabase.ts';
import { ok, err } from '../_shared/response.ts';
import { gradeWithinCeiling, meetsLevel, trackForCategory } from '../_shared/progression.ts';
import { type Stripe, expireCheckout, getStripe } from '../_shared/stripe.ts';
import { sendPush } from '../_shared/push.ts';
import { isAtCapacity, isEventFullError, markFullIfAtCapacity } from '../_shared/capacity.ts';
import { type ListRow, type MemberStatus, memberStatus } from '../_shared/membership.ts';
import { type PriceOption, resolveCharge } from '../_shared/pricing.ts';

type EventRow = {
  id: string;
  title: string;
  min_level: string;
  max_participants: number | null;
  approval_mode: 'auto' | 'manual_all';
  status: string;
  leader_id: string;
  cost: number | string | null;
  price_options: PriceOption[] | null;
  grade_advertised: string | null;
  category: { name: string } | null;
};

type ExistingSignup = {
  id: string;
  status: string;
  checkout_session_id: string | null;
  reviewed_by: string | null;
} | null;

type Routing = { status: string; message: string };

const WAITLISTED: Routing = {
  status: 'waitlisted',
  message: "Event is full — you've been added to the waitlist",
};

// Always to the leader, even when the trip is full: they decide first, and
// review-signup re-checks capacity (waitlisting if needed) when they confirm.
// Never auto-waitlisted, or a promotion could seat them without a review.
const BELOW_LEVEL: Routing = {
  status: 'pending_review',
  message:
    "Request sent — you're below this trip's minimum level, so the leader will look at your paddling experience and decide",
};

/** Statuses a fresh sign-up call may overwrite on an existing row. */
const REJOINABLE_STATUSES = new Set(['pending_payment', 'withdrawn', 'waitlisted']);

/** How long a Checkout session (and the seat it holds) lives. Stripe allows 30 min – 24 h. */
const CHECKOUT_TTL_SECONDS = 2 * 60 * 60;

/** How many events an aspirant may sign up to before they must join. */
const TRIAL_LIMIT = 3;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await createClients(req);
    if (auth.error) {
      return auth.error;
    }
    const { admin, user } = auth.clients;

    const { event_id, return_url, price_option } = await req.json();
    if (!event_id) {
      return err('event_id is required', 400);
    }

    const event = await loadEvent(admin, event_id);
    if (!event) {
      return err('Event not found', 404);
    }
    // 'full' still accepts sign-ups — they route to the waitlist. Only draft,
    // closed and cancelled are hard stops.
    if (event.status !== 'open' && event.status !== 'full') {
      return err(`Event is ${event.status} — sign-ups are closed`, 409);
    }
    if (event.leader_id === user.id) {
      return err("You're the leader of this event — no sign-up needed", 409);
    }

    const profile = await loadProfile(admin, user);
    if (!profile) {
      return err('Profile not found — complete your profile first', 404);
    }
    if (profile.status === 'lapsed') {
      return err('Your membership has lapsed — please renew to sign up', 403);
    }
    if (profile.status === 'suspended') {
      return err('Your account is suspended', 403);
    }
    const existing = await loadExistingSignup(admin, event_id, user.id);
    // 'withdrawn' is the member's own cancellation, so let them rejoin by
    // reusing the row (unique on event_id+member_id). 'declined' is the
    // leader's call and stays blocked.
    if (existing && !REJOINABLE_STATUSES.has(existing.status)) {
      return err(`Already signed up — status: ${existing.status}`, 409);
    }

    // A pending_payment row is a seat already granted — auto-confirmed or
    // leader-approved — that the member is coming back to pay for.
    const resuming = existing?.status === 'pending_payment';
    // A waitlisted member signing up again is claiming a seat that opened —
    // on a paid event that's the only way off the waitlist (promoteFromWaitlist
    // only sends an offer). Their place passed the level check when they
    // joined, and their row already counts towards the trial.
    const claiming = existing?.status === 'waitlisted';
    // Approved by the leader before the event filled, so no second review.
    const approved = resuming || (claiming && !!existing?.reviewed_by);

    // Resuming opens a fresh checkout, so close the previous one first —
    // otherwise both stay payable and only the newer one is tracked.
    if (
      resuming &&
      existing?.checkout_session_id &&
      !(await expireCheckout(existing.checkout_session_id))
    ) {
      return err("You've already paid — your place will show as confirmed shortly", 409);
    }

    // Below the minimum level isn't a hard stop: the member can ask the
    // leader, who decides with their paddling experience in front of them.
    // The questionnaire is required so the leader has something to go on.
    // A leader-approved seat (resuming) has already been through this.
    const belowLevel = !resuming && !claiming && !meetsLevel(profile.level, event.min_level);
    if (belowLevel && !(await hasExperienceAnswers(admin, user.id))) {
      return err(
        `This trip needs ${event.min_level} level or above — you're ${profile.level}. Tell us your paddling experience and you can ask the leader.`,
        403,
      );
    }

    // Aspirants (prospective members not yet matched to the paid list) get a
    // 3-event trial, then must join. A trial is used by a place they hold —
    // confirmed, mid-checkout, awaiting review, or waitlisted. A place they
    // cancelled (withdrawn) or a leader-declined request does NOT use one.
    // Resuming a checkout is the one place already counted; rejoining a
    // withdrawn row is a new place and is checked like any other.
    if (profile.status === 'aspirant' && !resuming && !claiming) {
      const used = await countTrialSignups(admin, user.id);
      if (used >= TRIAL_LIMIT) {
        return err(
          `You've used all ${TRIAL_LIMIT} of your trial events — join DCKC to keep signing up`,
          403,
        );
      }
    }

    // The amount is always resolved server-side. When the event carries
    // concession tiers the client sends only *which* tier (an index), never a
    // price — a tampered client can at worst pick a legitimate cheaper tier, it
    // can't invent an amount. Falls back to the flat `cost` when there are no
    // tiers, and to the standard (index 0) tier when the choice is missing or
    // out of range.
    const charge = resolveCharge(event, price_option);
    const costPence = charge.pence;
    const isPaid = costPence > 0;

    let routing = belowLevel ? BELOW_LEVEL : await decideRouting(admin, event, user.id);
    // Resuming an approved seat skips review again. If the member picked a £0
    // tier this confirms them outright instead of bouncing back to review.
    // Capacity still wins: a seat that filled meanwhile gets the waitlist.
    if (approved && routing.status !== 'waitlisted') {
      routing = { status: 'confirmed', message: "You're in! Sign-up confirmed" };
    }
    // No seat to claim after all. Leave the row alone: rewriting it would reset
    // signed_up_at and send them to the back of the queue.
    // ponytail: any waitlisted member can claim an open seat, not just the one
    // offered it; a claim window (post-MVP) is the fix if that matters.
    if (claiming && routing.status === 'waitlisted') {
      return err("Sorry, that seat's gone — you're still on the waitlist", 409);
    }

    // Paid + approved → Stripe Checkout. The webhook flips pending_payment →
    // confirmed on payment_intent.succeeded. Manual_all + paid stops short on
    // first signup (pending_review, no Stripe).
    let signupId: string | null = null;
    if (isPaid && routing.status === 'confirmed') {
      if (!return_url) {
        return err('return_url is required for paid events', 400);
      }
      try {
        signupId = await ensurePendingPaymentRow(admin, event_id, user.id, existing);
      } catch (e) {
        // The last seat went between our count and our write.
        if (!isEventFullError(String(e))) {
          throw e;
        }
        routing = WAITLISTED;
      }
    }

    if (signupId) {
      const checkout = await createCheckoutSession(admin, {
        event,
        userId: user.id,
        userEmail: user.email,
        signupId,
        costPence,
        priceLabel: charge.label,
        returnUrl: return_url,
      });
      return ok({
        signup: { id: signupId, status: 'pending_payment' },
        message: 'Continue to payment to complete sign-up',
        payment: { checkout_url: checkout.url, amount_pence: costPence },
      });
    }

    // No checkout yet — apply target status directly. Covers free events
    // (auto or manual_all), waitlisted seats, and the first hop of a paid
    // manual_all sign-up (pending_review until the leader confirms; payment
    // happens on a follow-up sign-up call after that).
    // Rejoining after withdrawing reuses the row and resets signed_up_at, so
    // the member goes to the back of the waitlist queue rather than keeping
    // their original place.
    const writeSignup = (status: string) =>
      existing
        ? admin
            .from('event_signups')
            .update({
              status,
              signed_up_at: new Date().toISOString(),
              reviewed_by: null,
              reviewed_at: null,
            })
            .eq('id', existing.id)
            .select()
            .single()
        : admin
            .from('event_signups')
            .insert({ event_id, member_id: user.id, status })
            .select()
            .single();

    let { data: signup, error: signupError } = await writeSignup(routing.status);
    if (routing.status === 'confirmed' && isEventFullError(signupError)) {
      routing = WAITLISTED;
      ({ data: signup, error: signupError } = await writeSignup(routing.status));
    }
    if (signupError) {
      return err(`Failed to create sign-up: ${signupError.message}`, 500);
    }

    if (routing.status === 'confirmed') {
      await markFullIfAtCapacity(admin, event_id);
    }

    await notifyLeader(admin, event, profile, signup.id, routing.status, belowLevel);

    return ok({ signup, message: routing.message });
  } catch (e) {
    return err(`Internal error: ${String(e)}`, 500);
  }
});

// ---------- Loaders ----------

async function loadEvent(admin: SupabaseClient, eventId: string): Promise<EventRow | null> {
  const { data } = await admin
    .from('events')
    .select(
      'id, title, min_level, max_participants, approval_mode, status, leader_id, cost, price_options, grade_advertised, category:event_categories(name)',
    )
    .eq('id', eventId)
    .single();
  return (data as unknown as EventRow) ?? null;
}

// Status is worked out here, not stored: the admin's override, else the
// member's row on the verified list. Only a confirmed email counts, since the
// match is what proves they own the address.
async function loadProfile(
  admin: SupabaseClient,
  user: { id: string; email?: string; email_confirmed_at?: string },
) {
  const [profRes, listRes] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, level, status_override')
      .eq('id', user.id)
      .single(),
    user.email && user.email_confirmed_at
      ? admin
          .from('verified_members')
          .select('expires_on')
          .eq('email_norm', user.email.trim().toLowerCase())
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const profile = profRes.data as {
    id: string;
    full_name: string | null;
    level: string;
    status_override: MemberStatus | null;
  } | null;
  if (!profile) {
    return null;
  }
  return {
    ...profile,
    status: memberStatus(profile.status_override, (listRes.data as ListRow | null) ?? null),
  };
}

async function loadExistingSignup(
  admin: SupabaseClient,
  eventId: string,
  userId: string,
): Promise<ExistingSignup> {
  const { data } = await admin
    .from('event_signups')
    .select('id, status, checkout_session_id, reviewed_by')
    .eq('event_id', eventId)
    .eq('member_id', userId)
    .maybeSingle();
  return data;
}

/** True if the member has answered at least one experience question. */
async function hasExperienceAnswers(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('member_private')
    .select('experience_answers')
    .eq('member_id', userId)
    .maybeSingle();
  const answers = (data?.experience_answers ?? null) as Record<string, unknown> | null;
  return (
    !!answers && Object.values(answers).some((v) => typeof v === 'string' && v.trim().length > 0)
  );
}

/**
 * Trial usage for the aspirant cap: places the member holds — confirmed,
 * mid-checkout, awaiting review, or waitlisted. Cancelled (withdrawn) and
 * declined sign-ups don't count, so cancelling frees the trial. An abandoned
 * checkout frees it when the session expires after two hours
 * (checkout.session.expired withdraws the row). Counting pending_payment matters: nothing re-checks the
 * cap at payment time, so without it an aspirant could open checkout on any
 * number of trips and pay for them all. One row per (event, member), so the
 * row count is the number of events. Mirrors public.my_membership().
 */
async function countTrialSignups(admin: SupabaseClient, userId: string): Promise<number> {
  const { count } = await admin
    .from('event_signups')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', userId)
    .in('status', ['confirmed', 'pending_payment', 'pending_review', 'waitlisted']);
  return count ?? 0;
}

// ---------- Routing decision ----------

async function decideRouting(
  admin: SupabaseClient,
  event: EventRow,
  userId: string,
): Promise<Routing> {
  // Exclude this member's own row: a held pending_payment seat is theirs, and
  // counting it would bounce them to the waitlist when they resume checkout.
  if (await isAtCapacity(admin, event, userId)) {
    return WAITLISTED;
  }
  if (event.approval_mode === 'manual_all') {
    return {
      status: 'pending_review',
      message: 'Sign-up submitted — the leader will review your request',
    };
  }
  if (await isAboveApprovalCeiling(admin, event, userId)) {
    return {
      status: 'pending_review',
      message:
        'Sign-up submitted — this trip is above your approval ceiling, the leader will review',
    };
  }
  return { status: 'confirmed', message: "You're in! Sign-up confirmed" };
}

async function isAboveApprovalCeiling(
  admin: SupabaseClient,
  event: EventRow,
  userId: string,
): Promise<boolean> {
  const track = trackForCategory(event.category?.name ?? null);
  if (!track || !event.grade_advertised) {
    return false;
  }
  const { data: approval } = await admin
    .from('member_approvals')
    .select('ceiling')
    .eq('member_id', userId)
    .eq('track', track)
    .maybeSingle();
  const ceiling = approval?.ceiling ?? null;
  return !ceiling || !gradeWithinCeiling(track, ceiling, event.grade_advertised);
}

// ---------- Paid sign-up plumbing ----------

async function ensurePendingPaymentRow(
  admin: SupabaseClient,
  eventId: string,
  userId: string,
  existing: ExistingSignup,
): Promise<string> {
  if (existing) {
    // Could be a withdrawn row being rejoined, so put it back into
    // pending_payment — the webhook only confirms rows in that status. The
    // error must be checked: sending someone to Stripe for a row that stayed
    // withdrawn takes a payment the webhook can't match.
    // A rejoin also drops any old review, so the webhook tells the leader
    // about it; resuming a leader-approved checkout keeps it.
    const review =
      existing.status === 'pending_payment' ? {} : { reviewed_by: null, reviewed_at: null };
    const { error } = await admin
      .from('event_signups')
      .update({ status: 'pending_payment', payment_status: 'pending', ...review })
      .eq('id', existing.id);
    if (error) {
      throw new Error(`Failed to update sign-up: ${error.message}`);
    }
    return existing.id;
  }
  const { data, error } = await admin
    .from('event_signups')
    .insert({
      event_id: eventId,
      member_id: userId,
      status: 'pending_payment',
      payment_status: 'pending',
    })
    .select()
    .single();
  if (error) {
    throw new Error(`Failed to create sign-up: ${error.message}`);
  }
  return data.id;
}

async function createCheckoutSession(
  admin: SupabaseClient,
  args: {
    event: EventRow;
    userId: string;
    userEmail?: string;
    signupId: string;
    costPence: number;
    priceLabel: string | null;
    returnUrl: string;
  },
): Promise<{ url: string | null }> {
  const { event, userId, userEmail, signupId, costPence, priceLabel, returnUrl } = args;
  const sep = returnUrl.includes('?') ? '&' : '?';
  const stripe = getStripe();
  const metadata: Stripe.MetadataParam = {
    signup_id: signupId,
    event_id: event.id,
    member_id: userId,
  };
  // Show the chosen tier on the Stripe page + receipt (e.g. "Pinkston — Under 18").
  const productName = priceLabel ? `${event.title} — ${priceLabel}` : event.title;
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'gbp',
          product_data: { name: productName },
          unit_amount: costPence,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      description: `OtterPool — ${event.title}`,
      metadata,
    },
    metadata,
    customer_email: userEmail,
    // Stripe's default is 24h, and a held seat (and an aspirant's trial) is
    // locked for as long as the session lives. Two hours is plenty to pay.
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS,
    success_url: `${returnUrl}${sep}paid=1`,
    cancel_url: `${returnUrl}${sep}cancelled=1`,
  });
  // Mark this session as the one holding the seat — see handleCheckoutExpired.
  const { error } = await admin
    .from('event_signups')
    .update({ checkout_session_id: session.id })
    .eq('id', signupId);
  if (error) {
    throw new Error(`Failed to record checkout session: ${error.message}`);
  }
  return { url: session.url };
}

// ---------- Notifications ----------

async function notifyLeader(
  admin: SupabaseClient,
  event: EventRow,
  member: { full_name: string | null; level: string },
  signupId: string,
  targetStatus: string,
  belowLevel: boolean,
): Promise<void> {
  const memberName = member.full_name ?? 'A member';
  // pending_review needs the leader's action; confirmed is FYI.
  const title = belowLevel
    ? 'Below-level request to review'
    : targetStatus === 'pending_review'
      ? 'New sign-up to review'
      : 'New sign-up';
  const body = belowLevel
    ? `${memberName} (${member.level}) asked to join ${event.title}, which needs ${event.min_level}. Their paddling experience is in the review list.`
    : `${memberName} signed up to ${event.title}`;
  await sendPush(admin, [event.leader_id], {
    title,
    body,
    data: { type: 'signup', event_id: event.id, signup_id: signupId, status: targetStatus },
  });
}
