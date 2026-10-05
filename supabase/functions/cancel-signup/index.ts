// Cancels a sign-up at the member's (or leader's, or admin's) request.
//
// mode:
//   'reallow' (default) → status 'withdrawn'. The member may sign up again
//                         (sign-up treats 'withdrawn' as rejoinable).
//   'block'             → status 'declined'. The member cannot sign up again
//                         (sign-up rejects 'declined'). Leader/admin only — a
//                         member can't block themselves.
// If the freed place was a seat (confirmed/pending_payment) the oldest
// waitlisted member is promoted either way.
//
// Refunds are out of scope — if a paid 'confirmed' signup is cancelled, the
// money stays put and the leader handles the refund manually. Cancelling a
// 'pending_payment' row before payment is fine because no charge happened.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { createClients } from '../_shared/supabase.ts';
import { ok, err } from '../_shared/response.ts';
import { promoteFromWaitlist } from '../_shared/waitlist.ts';
import { isPaddlingAdmin } from '../_shared/authz.ts';
import { sendPush } from '../_shared/push.ts';
import { getStripe } from '../_shared/stripe.ts';

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

    const { signup_id, mode } = await req.json();
    if (!signup_id) {
      return err('signup_id is required', 400);
    }
    if (mode !== undefined && mode !== 'reallow' && mode !== 'block') {
      return err("mode must be 'reallow' or 'block'", 400);
    }
    const block = mode === 'block';
    const newStatus = block ? 'declined' : 'withdrawn';

    const signup = await loadSignup(admin, signup_id);
    if (!signup) {
      return err('Sign-up not found', 404);
    }

    const isMember = signup.member_id === user.id;
    const leaderOrAdmin = signup.leader_id === user.id || (await isPaddlingAdmin(admin, user.id));
    if (!(isMember || leaderOrAdmin)) {
      return err('Not allowed to cancel this sign-up', 403);
    }
    // Blocking re-sign-up is a leader/admin decision, not something a member
    // does to their own place.
    if (block && !leaderOrAdmin) {
      return err('Only the event leader or a paddling admin can block re-sign-up', 403);
    }

    // Only the leader/admin may move a cancelled row between withdrawn and
    // declined — otherwise a declined member could withdraw themselves and
    // rejoin.
    if (TERMINAL_STATUSES.has(signup.status) && !leaderOrAdmin) {
      return ok({ status: signup.status, message: 'Already cancelled' });
    }
    if (signup.status === newStatus) {
      return ok({ status: newStatus, message: 'Already set' });
    }

    const wasSeat = SEAT_STATUSES.has(signup.status);

    // Close the checkout first so they can't pay for a place they no longer
    // hold. Stripe refuses to expire a session that's already been paid, so
    // in that race we stop here and let the webhook confirm them.
    if (signup.status === 'pending_payment' && signup.checkout_session_id) {
      try {
        await getStripe().checkout.sessions.expire(signup.checkout_session_id);
      } catch (e) {
        return err(`Couldn't close their checkout, they may have just paid: ${String(e)}`, 409);
      }
    }

    const { error: updateErr } = await admin
      .from('event_signups')
      .update({ status: newStatus })
      .eq('id', signup_id);
    if (updateErr) {
      return err(`Failed to cancel: ${updateErr.message}`, 500);
    }

    if (wasSeat) {
      await promoteFromWaitlist(admin, signup.event_id);
    }

    if (!isMember && !TERMINAL_STATUSES.has(signup.status)) {
      await sendPush(admin, [signup.member_id], {
        title: 'Removed from trip',
        body: `The leader removed you from ${signup.event_title}`,
        data: {
          type: 'signup_cancelled',
          event_id: signup.event_id,
          signup_id: signup.id,
          status: newStatus,
        },
      });
    }

    return ok({ status: newStatus, promoted: wasSeat });
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
