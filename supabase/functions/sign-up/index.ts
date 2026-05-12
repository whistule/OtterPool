import { corsHeaders } from '../_shared/cors.ts';
import { createClients } from '../_shared/supabase.ts';
import { ok, err } from '../_shared/response.ts';
import { gradeWithinCeiling, meetsLevel, trackForCategory } from '../_shared/progression.ts';
import { getStripe } from '../_shared/stripe.ts';
import { sendPush } from '../_shared/push.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth
    const auth = await createClients(req);
    if (auth.error) {
      return auth.error;
    }
    const { admin, user } = auth.clients;

    // Parse request
    const { event_id, return_url } = await req.json();
    if (!event_id) {
      return err('event_id is required', 400);
    }

    // Fetch event
    const { data: event } = await admin
      .from('events')
      .select(
        'id, title, min_level, max_participants, approval_mode, status, leader_id, cost, grade_advertised, category:event_categories(name)',
      )
      .eq('id', event_id)
      .single();

    if (!event) {
      return err('Event not found', 404);
    }
    if (event.status !== 'open') {
      return err(`Event is ${event.status} — sign-ups are closed`, 409);
    }
    if (event.leader_id === user.id) {
      return err("You're the leader of this event — no sign-up needed", 409);
    }

    // Fetch member profile
    const { data: profile } = await admin
      .from('profiles')
      .select('id, full_name, level, status')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return err('Profile not found — complete your profile first', 404);
    }
    if (profile.status === 'lapsed') {
      return err('Your membership has lapsed — please renew to sign up', 403);
    }
    if (profile.status === 'suspended') {
      return err('Your account is suspended', 403);
    }

    // Cost in pence — Stripe operates in minor units
    const costPence = Math.round(Number(event.cost ?? 0) * 100);
    const isPaid = costPence > 0;

    // Check existing signup. Allow resuming a stalled paid signup with a fresh Checkout session.
    const { data: existing } = await admin
      .from('event_signups')
      .select('id, status')
      .eq('event_id', event_id)
      .eq('member_id', user.id)
      .maybeSingle();

    if (existing && existing.status !== 'pending_payment') {
      return err(`Already signed up — status: ${existing.status}`, 409);
    }

    // Check progression level
    if (!meetsLevel(profile.level, event.min_level)) {
      return err(`Requires ${event.min_level} level — you are currently ${profile.level}`, 403);
    }

    // Check capacity
    const { count: confirmedCount } = await admin
      .from('event_signups')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event_id)
      .eq('status', 'confirmed');

    const isFull = event.max_participants && (confirmedCount ?? 0) >= event.max_participants;

    // Determine target signup status (after payment, if paid)
    let targetStatus: string;
    let message: string;

    if (isFull) {
      targetStatus = 'waitlisted';
      message = "Event is full — you've been added to the waitlist";
    } else if (event.approval_mode === 'manual_all') {
      targetStatus = 'pending_review';
      message = 'Sign-up submitted — the leader will review your request';
    } else {
      // Auto-approve mode: confirm if the event's grade is within the
      // member's per-track ceiling, otherwise route to leader review.
      // No grade or non-graded category (e.g. Tuesday, Skills) → confirm.
      const categoryName = (event as { category?: { name: string } | null }).category?.name ?? null;
      const track = trackForCategory(categoryName);
      const eventGrade = event.grade_advertised ?? null;

      let aboveCeiling = false;
      if (track && eventGrade) {
        const { data: approval } = await admin
          .from('member_approvals')
          .select('ceiling')
          .eq('member_id', user.id)
          .eq('track', track)
          .maybeSingle();
        const ceiling = approval?.ceiling ?? null;
        aboveCeiling = !ceiling || !gradeWithinCeiling(track, ceiling, eventGrade);
      }

      if (aboveCeiling) {
        targetStatus = 'pending_review';
        message =
          'Sign-up submitted — this trip is above your approval ceiling, the leader will review';
      } else {
        targetStatus = 'confirmed';
        message = "You're in! Sign-up confirmed";
      }
    }

    // Paid + already approved → Stripe Checkout. "Approved" here means either
    // the auto-approve path (targetStatus === confirmed) or a pending_payment
    // row left by leader approval. The webhook flips pending_payment → confirmed
    // on payment_intent.succeeded; we don't need to encode that in metadata.
    // Manual_all + paid stops short on first signup (pending_review, no Stripe).
    const needsCheckout =
      isPaid && (targetStatus === 'confirmed' || existing?.status === 'pending_payment');

    if (needsCheckout) {
      if (!return_url) {
        return err('return_url is required for paid events', 400);
      }

      // Reuse the existing pending row, or create one
      let signupId: string;
      if (existing) {
        signupId = existing.id;
      } else {
        const { data: signup, error: signupError } = await admin
          .from('event_signups')
          .insert({
            event_id,
            member_id: user.id,
            status: 'pending_payment',
            payment_status: 'pending',
          })
          .select()
          .single();
        if (signupError) {
          return err(`Failed to create sign-up: ${signupError.message}`, 500);
        }
        signupId = signup.id;
      }

      const stripe = getStripe();
      const sep = return_url.includes('?') ? '&' : '?';
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
          metadata: {
            signup_id: signupId,
            event_id: event.id,
            member_id: user.id,
          },
        },
        metadata: {
          signup_id: signupId,
          event_id: event.id,
          member_id: user.id,
        },
        customer_email: user.email,
        success_url: `${return_url}${sep}paid=1`,
        cancel_url: `${return_url}${sep}cancelled=1`,
      });

      return ok({
        signup: { id: signupId, status: 'pending_payment' },
        message: 'Continue to payment to complete sign-up',
        payment: { checkout_url: session.url, amount_pence: costPence },
      });
    }

    // No checkout step needed yet — apply target status directly.
    // Covers: free events (auto or manual_all), waitlisted seats, and the
    // first hop of a paid manual_all sign-up (pending_review until the leader
    // confirms — payment happens on a follow-up sign-up call after that).
    const { data: signup, error: signupError } = await admin
      .from('event_signups')
      .insert({ event_id, member_id: user.id, status: targetStatus })
      .select()
      .single();

    if (signupError) {
      return err(`Failed to create sign-up: ${signupError.message}`, 500);
    }

    // If event just hit capacity, update status to full
    if (targetStatus === 'confirmed' && event.max_participants) {
      if ((confirmedCount ?? 0) + 1 >= event.max_participants) {
        await admin.from('events').update({ status: 'full' }).eq('id', event_id);
      }
    }

    // Notify the leader. pending_review needs their action; confirmed is FYI.
    const leaderTitle =
      targetStatus === 'pending_review' ? 'New sign-up to review' : 'New sign-up';
    const memberName = profile.full_name ?? 'A member';
    await sendPush(admin, [event.leader_id], {
      title: leaderTitle,
      body: `${memberName} signed up to ${event.title}`,
      data: { type: 'signup', event_id: event.id, signup_id: signup.id, status: targetStatus },
    });

    return ok({ signup, message });
  } catch (e) {
    return err(`Internal error: ${String(e)}`, 500);
  }
});
