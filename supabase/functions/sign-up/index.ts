import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { createClients } from '../_shared/supabase.ts';
import { ok, err } from '../_shared/response.ts';
import { gradeWithinCeiling, meetsLevel, trackForCategory } from '../_shared/progression.ts';
import { Stripe, getStripe } from '../_shared/stripe.ts';
import { sendPush } from '../_shared/push.ts';
import { markFullIfAtCapacity } from '../_shared/capacity.ts';

type EventRow = {
  id: string;
  title: string;
  min_level: string;
  max_participants: number | null;
  approval_mode: 'auto' | 'manual_all';
  status: string;
  leader_id: string;
  cost: number | string | null;
  grade_advertised: string | null;
  category: { name: string } | null;
};

type ExistingSignup = { id: string; status: string } | null;

type Routing = { status: string; message: string };

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

    const { event_id, return_url } = await req.json();
    if (!event_id) {
      return err('event_id is required', 400);
    }

    const event = await loadEvent(admin, event_id);
    if (!event) {
      return err('Event not found', 404);
    }
    if (event.status !== 'open') {
      return err(`Event is ${event.status} — sign-ups are closed`, 409);
    }
    if (event.leader_id === user.id) {
      return err("You're the leader of this event — no sign-up needed", 409);
    }

    const profile = await loadProfile(admin, user.id);
    if (!profile) {
      return err('Profile not found — complete your profile first', 404);
    }
    if (profile.status === 'lapsed') {
      return err('Your membership has lapsed — please renew to sign up', 403);
    }
    if (profile.status === 'suspended') {
      return err('Your account is suspended', 403);
    }
    if (!meetsLevel(profile.level, event.min_level)) {
      return err(`Requires ${event.min_level} level — you are currently ${profile.level}`, 403);
    }

    const existing = await loadExistingSignup(admin, event_id, user.id);
    if (existing && existing.status !== 'pending_payment') {
      return err(`Already signed up — status: ${existing.status}`, 409);
    }

    const costPence = Math.round(Number(event.cost ?? 0) * 100);
    const isPaid = costPence > 0;

    const routing = await decideRouting(admin, event, user.id);

    // Paid + already approved → Stripe Checkout. "Approved" means either the
    // auto-approve path (targetStatus === confirmed) or a pending_payment row
    // left by leader approval. The webhook flips pending_payment → confirmed
    // on payment_intent.succeeded. Manual_all + paid stops short on first
    // signup (pending_review, no Stripe).
    const needsCheckout =
      isPaid && (routing.status === 'confirmed' || existing?.status === 'pending_payment');

    if (needsCheckout) {
      if (!return_url) {
        return err('return_url is required for paid events', 400);
      }
      const signupId = await ensurePendingPaymentRow(admin, event_id, user.id, existing);
      const checkoutUrl = await createCheckoutSession({
        event,
        userId: user.id,
        userEmail: user.email,
        signupId,
        costPence,
        returnUrl: return_url,
      });
      return ok({
        signup: { id: signupId, status: 'pending_payment' },
        message: 'Continue to payment to complete sign-up',
        payment: { checkout_url: checkoutUrl, amount_pence: costPence },
      });
    }

    // No checkout yet — apply target status directly. Covers free events
    // (auto or manual_all), waitlisted seats, and the first hop of a paid
    // manual_all sign-up (pending_review until the leader confirms; payment
    // happens on a follow-up sign-up call after that).
    const { data: signup, error: signupError } = await admin
      .from('event_signups')
      .insert({ event_id, member_id: user.id, status: routing.status })
      .select()
      .single();
    if (signupError) {
      return err(`Failed to create sign-up: ${signupError.message}`, 500);
    }

    if (routing.status === 'confirmed') {
      await markFullIfAtCapacity(admin, event_id);
    }

    await notifyLeader(admin, event, profile.full_name, signup.id, routing.status);

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
      'id, title, min_level, max_participants, approval_mode, status, leader_id, cost, grade_advertised, category:event_categories(name)',
    )
    .eq('id', eventId)
    .single();
  return (data as unknown as EventRow) ?? null;
}

async function loadProfile(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from('profiles')
    .select('id, full_name, level, status')
    .eq('id', userId)
    .single();
  return data;
}

async function loadExistingSignup(
  admin: SupabaseClient,
  eventId: string,
  userId: string,
): Promise<ExistingSignup> {
  const { data } = await admin
    .from('event_signups')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('member_id', userId)
    .maybeSingle();
  return data;
}

// ---------- Routing decision ----------

async function decideRouting(
  admin: SupabaseClient,
  event: EventRow,
  userId: string,
): Promise<Routing> {
  if (await isAtCapacity(admin, event)) {
    return {
      status: 'waitlisted',
      message: "Event is full — you've been added to the waitlist",
    };
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

async function isAtCapacity(admin: SupabaseClient, event: EventRow): Promise<boolean> {
  if (!event.max_participants) {
    return false;
  }
  const { count } = await admin
    .from('event_signups')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event.id)
    .eq('status', 'confirmed');
  return (count ?? 0) >= event.max_participants;
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

async function createCheckoutSession(args: {
  event: EventRow;
  userId: string;
  userEmail?: string;
  signupId: string;
  costPence: number;
  returnUrl: string;
}): Promise<string | null> {
  const { event, userId, userEmail, signupId, costPence, returnUrl } = args;
  const sep = returnUrl.includes('?') ? '&' : '?';
  const stripe = getStripe();
  const metadata: Stripe.MetadataParam = {
    signup_id: signupId,
    event_id: event.id,
    member_id: userId,
  };
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'gbp',
          product_data: { name: event.title },
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
    success_url: `${returnUrl}${sep}paid=1`,
    cancel_url: `${returnUrl}${sep}cancelled=1`,
  });
  return session.url;
}

// ---------- Notifications ----------

async function notifyLeader(
  admin: SupabaseClient,
  event: EventRow,
  memberFullName: string | null,
  signupId: string,
  targetStatus: string,
): Promise<void> {
  // pending_review needs the leader's action; confirmed is FYI.
  const title = targetStatus === 'pending_review' ? 'New sign-up to review' : 'New sign-up';
  const memberName = memberFullName ?? 'A member';
  await sendPush(admin, [event.leader_id], {
    title,
    body: `${memberName} signed up to ${event.title}`,
    data: { type: 'signup', event_id: event.id, signup_id: signupId, status: targetStatus },
  });
}
