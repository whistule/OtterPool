// Stripe → OtterPool webhook handler.
// Deployed with verify_jwt = false so Stripe (unauthenticated) can hit it.
// Authenticity is enforced by verifying the Stripe signature.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Stripe, getStripe } from '../_shared/stripe.ts';
import { sendPush } from '../_shared/push.ts';
import { promoteFromWaitlist } from '../_shared/waitlist.ts';
import { markFullIfAtCapacity } from '../_shared/capacity.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const parsed = await parseStripeEvent(req);
  if (parsed.error) {
    return parsed.error;
  }
  const event = parsed.event;
  const admin = createAdminClient();

  if (event.type === 'payment_intent.succeeded') {
    return await handlePaymentSucceeded(admin, event.data.object as Stripe.PaymentIntent);
  }
  if (event.type === 'payment_intent.payment_failed') {
    return await handlePaymentFailed(admin, event.data.object as Stripe.PaymentIntent);
  }
  if (event.type === 'payment_intent.canceled') {
    return await handlePaymentCanceled(admin, event.data.object as Stripe.PaymentIntent);
  }

  return jsonOk();
});

// ---------- Request plumbing ----------

async function parseStripeEvent(
  req: Request,
): Promise<{ event: Stripe.Event; error?: never } | { event?: never; error: Response }> {
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return { error: new Response('missing stripe-signature', { status: 400 }) };
  }
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) {
    return { error: new Response('STRIPE_WEBHOOK_SECRET not configured', { status: 500 }) };
  }
  const body = await req.text();
  try {
    const event = await getStripe().webhooks.constructEventAsync(
      body,
      sig,
      secret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
    return { event };
  } catch (e) {
    return { error: new Response(`signature error: ${String(e)}`, { status: 400 }) };
  }
}

function createAdminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

function jsonOk(): Response {
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------- Event handlers ----------

async function handlePaymentSucceeded(
  admin: SupabaseClient,
  pi: Stripe.PaymentIntent,
): Promise<Response> {
  const signupId = pi.metadata?.signup_id;
  if (!signupId) {
    return new Response('no signup_id in metadata', { status: 200 });
  }

  // Only flip pending_payment rows — don't clobber a row that was since
  // cancelled or refunded.
  const { data: updated, error: updateErr } = await admin
    .from('event_signups')
    .update({
      status: 'confirmed',
      payment_status: 'paid',
      amount_paid_pence: pi.amount,
      payment_intent_id: pi.id,
    })
    .eq('id', signupId)
    .eq('status', 'pending_payment')
    .select('event_id, member_id')
    .maybeSingle();

  if (updateErr) {
    return new Response(`update failed: ${updateErr.message}`, { status: 500 });
  }
  if (!updated) {
    return jsonOk();
  }

  await markFullIfAtCapacity(admin, updated.event_id);
  await notifyPaymentConfirmed(admin, updated.event_id, updated.member_id, signupId);
  return jsonOk();
}

async function handlePaymentFailed(
  admin: SupabaseClient,
  pi: Stripe.PaymentIntent,
): Promise<Response> {
  const signupId = pi.metadata?.signup_id;
  if (signupId) {
    await admin.from('event_signups').update({ payment_status: 'failed' }).eq('id', signupId);
  }
  return jsonOk();
}

async function handlePaymentCanceled(
  admin: SupabaseClient,
  pi: Stripe.PaymentIntent,
): Promise<Response> {
  const signupId = pi.metadata?.signup_id;
  if (!signupId) {
    return jsonOk();
  }
  const { data: cancelled } = await admin
    .from('event_signups')
    .update({ payment_status: 'canceled', status: 'withdrawn' })
    .eq('id', signupId)
    .select('event_id')
    .maybeSingle();

  if (cancelled?.event_id) {
    await promoteFromWaitlist(admin, cancelled.event_id);
  }
  return jsonOk();
}

// ---------- Notifications ----------

async function notifyPaymentConfirmed(
  admin: SupabaseClient,
  eventId: string,
  memberId: string,
  signupId: string,
): Promise<void> {
  const { data: ev } = await admin.from('events').select('title').eq('id', eventId).single();
  await sendPush(admin, [memberId], {
    title: 'Payment received',
    body: `You're confirmed for ${ev?.title ?? 'your event'}`,
    data: { type: 'payment_confirmed', event_id: eventId, signup_id: signupId },
  });
}
