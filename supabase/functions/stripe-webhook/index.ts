// Stripe → OtterPool webhook handler.
// Deployed with verify_jwt = false so Stripe (unauthenticated) can hit it.
// Authenticity is enforced by verifying the Stripe signature.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Stripe, getStripe } from '../_shared/stripe.ts';
import { sendPush } from '../_shared/push.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return new Response('missing stripe-signature', { status: 400 });
  }

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) {
    return new Response('STRIPE_WEBHOOK_SECRET not configured', { status: 500 });
  }

  const body = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      secret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (e) {
    return new Response(`signature error: ${String(e)}`, { status: 400 });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent;
    const signupId = pi.metadata?.signup_id;
    if (!signupId) {
      return new Response('no signup_id in metadata', { status: 200 });
    }

    // A successful payment always confirms the seat. By the time payment goes
    // through, the seat has already been approved (auto for open events, or
    // by the leader for manual_all events) and moved to pending_payment.
    // We only flip pending_payment rows so we don't clobber a row that was
    // since cancelled or refunded.
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

    // If this confirmation just filled the event, mark it full
    if (updated) {
      const { data: ev } = await admin
        .from('events')
        .select('title, max_participants, status')
        .eq('id', updated.event_id)
        .single();

      if (ev?.max_participants && ev.status === 'open') {
        const { count } = await admin
          .from('event_signups')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', updated.event_id)
          .eq('status', 'confirmed');
        if ((count ?? 0) >= ev.max_participants) {
          await admin.from('events').update({ status: 'full' }).eq('id', updated.event_id);
        }
      }

      await sendPush(admin, [updated.member_id], {
        title: 'Payment received',
        body: `You're confirmed for ${ev?.title ?? 'your event'}`,
        data: {
          type: 'payment_confirmed',
          event_id: updated.event_id,
          signup_id: signupId,
        },
      });
    }
  } else if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object as Stripe.PaymentIntent;
    const signupId = pi.metadata?.signup_id;
    if (signupId) {
      await admin.from('event_signups').update({ payment_status: 'failed' }).eq('id', signupId);
    }
  } else if (event.type === 'payment_intent.canceled') {
    const pi = event.data.object as Stripe.PaymentIntent;
    const signupId = pi.metadata?.signup_id;
    if (signupId) {
      await admin
        .from('event_signups')
        .update({ payment_status: 'canceled', status: 'withdrawn' })
        .eq('id', signupId);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
