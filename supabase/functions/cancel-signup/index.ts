// Withdraws a sign-up at the member's (or leader's, or admin's) request.
// Flips status to 'withdrawn' and, if the freed seat was confirmed, promotes
// the oldest waitlisted member. A member removed by someone else gets a push.
//
// Refunds are out of scope — if a paid 'confirmed' signup withdraws, the
// money stays put and the leader handles the refund manually. Cancelling a
// 'pending_payment' row before payment is fine because no charge happened.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { createClients } from '../_shared/supabase.ts';
import { ok, err } from '../_shared/response.ts';
import { promoteFromWaitlist } from '../_shared/waitlist.ts';
import { isPaddlingAdmin } from '../_shared/authz.ts';
import { sendPush } from '../_shared/push.ts';
import { expireCheckout } from '../_shared/stripe.ts';

type LoadedSignup = {
  id: string;
  status: string;
  event_id: string;
  member_id: string;
  leader_id: string | null;
  event_title: string;
  checkout_session_id: string | null;
};

const SEAT_STATUSES = new Set(['confirmed', 'pending_payment']);
const TERMINAL_STATUSES = new Set(['withdrawn', 'declined']);

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

    const { signup_id } = await req.json();
    if (!signup_id) {
      return err('signup_id is required', 400);
    }

    const signup = await loadSignup(admin, signup_id);
    if (!signup) {
      return err('Sign-up not found', 404);
    }

    if (!(await canCancel(admin, signup, user.id))) {
      return err('Not allowed to cancel this sign-up', 403);
    }

    if (TERMINAL_STATUSES.has(signup.status)) {
      return ok({ status: signup.status, message: 'Already cancelled' });
    }

    const wasSeat = SEAT_STATUSES.has(signup.status);

    // Close the checkout first so they can't pay for a place they no longer
    // hold. If it's already been paid, stop and let the webhook confirm them.
    if (
      signup.status === 'pending_payment' &&
      signup.checkout_session_id &&
      !(await expireCheckout(signup.checkout_session_id))
    ) {
      return err('Payment has just gone through, so the place is confirmed. Refresh to see it.', 409);
    }

    const { error: updateErr } = await admin
      .from('event_signups')
      .update({ status: 'withdrawn' })
      .eq('id', signup_id);
    if (updateErr) {
      return err(`Failed to cancel: ${updateErr.message}`, 500);
    }

    if (wasSeat) {
      await promoteFromWaitlist(admin, signup.event_id);
    }

    if (signup.member_id !== user.id) {
      await sendPush(admin, [signup.member_id], {
        title: 'Removed from trip',
        body: `You've been removed from ${signup.event_title}`,
        data: {
          type: 'signup_cancelled',
          event_id: signup.event_id,
          signup_id: signup.id,
          status: 'withdrawn',
        },
      });
    }

    return ok({ status: 'withdrawn', promoted: wasSeat });
  } catch (e) {
    return err(`Internal error: ${String(e)}`, 500);
  }
});

async function loadSignup(admin: SupabaseClient, signupId: string): Promise<LoadedSignup | null> {
  const { data } = await admin
    .from('event_signups')
    .select(
      'id, event_id, member_id, status, checkout_session_id, event:events!event_signups_event_id_fkey(leader_id, title)',
    )
    .eq('id', signupId)
    .maybeSingle();
  if (!data) {
    return null;
  }
  const event = (data as { event?: { leader_id: string; title: string } | null }).event ?? null;
  return {
    id: data.id,
    status: data.status,
    event_id: data.event_id,
    member_id: data.member_id,
    leader_id: event?.leader_id ?? null,
    event_title: event?.title ?? 'a trip',
    checkout_session_id: data.checkout_session_id ?? null,
  };
}

async function canCancel(
  admin: SupabaseClient,
  signup: LoadedSignup,
  userId: string,
): Promise<boolean> {
  if (signup.member_id === userId) {
    return true;
  }
  if (signup.leader_id === userId) {
    return true;
  }
  return await isPaddlingAdmin(admin, userId);
}
