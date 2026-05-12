import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { createClients } from '../_shared/supabase.ts';
import { ok, err } from '../_shared/response.ts';
import { sendPush } from '../_shared/push.ts';
import { markFullIfAtCapacity } from '../_shared/capacity.ts';

type ReviewEvent = {
  id: string;
  title: string;
  leader_id: string;
  cost: number;
  max_participants: number | null;
  status: string;
};

type LoadedSignup = {
  id: string;
  status: string;
  event_id: string;
  member_id: string;
  event: ReviewEvent | null;
};

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

    const { signup_id, action } = await req.json();
    if (!signup_id) {
      return err('signup_id is required', 400);
    }
    if (action !== 'confirm' && action !== 'deny') {
      return err("action must be 'confirm' or 'deny'", 400);
    }

    const signup = await loadSignup(admin, signup_id);
    if (!signup) {
      return err('Sign-up not found', 404);
    }
    const event = signup.event;
    if (!event) {
      return err('Event not found for sign-up', 404);
    }
    if (event.leader_id !== user.id) {
      return err('Only the event leader can review sign-ups', 403);
    }
    if (signup.status !== 'pending_review') {
      return err(`Sign-up is not pending review (status: ${signup.status})`, 409);
    }

    if (action === 'deny') {
      return await denySignup(admin, signup, event, user.id);
    }
    return await confirmSignup(admin, signup, event, user.id);
  } catch (e) {
    return err(`Internal error: ${String(e)}`, 500);
  }
});

// ---------- Loaders ----------

async function loadSignup(admin: SupabaseClient, signupId: string): Promise<LoadedSignup | null> {
  const { data } = await admin
    .from('event_signups')
    .select(
      'id, status, event_id, member_id, event:events!event_signups_event_id_fkey(id, title, leader_id, cost, max_participants, status)',
    )
    .eq('id', signupId)
    .maybeSingle();
  return (data as unknown as LoadedSignup) ?? null;
}

// ---------- Actions ----------

async function denySignup(
  admin: SupabaseClient,
  signup: LoadedSignup,
  event: ReviewEvent,
  reviewerId: string,
): Promise<Response> {
  const updateErr = await applyReview(admin, signup.id, reviewerId, { status: 'declined' });
  if (updateErr) {
    return err(`Update failed: ${updateErr}`, 500);
  }
  await sendPush(admin, [signup.member_id], {
    title: 'Sign-up declined',
    body: `Your sign-up to ${event.title} was declined`,
    data: { type: 'signup_reviewed', event_id: event.id, signup_id: signup.id, status: 'declined' },
  });
  return ok({ signup_id: signup.id, status: 'declined' });
}

async function confirmSignup(
  admin: SupabaseClient,
  signup: LoadedSignup,
  event: ReviewEvent,
  reviewerId: string,
): Promise<Response> {
  // Re-check capacity at decision time — another signup may have filled the
  // event while this one sat in pending_review.
  if (await isAtCapacity(admin, event)) {
    return await routeToWaitlist(admin, signup, event, reviewerId);
  }

  const isPaid = Number(event.cost ?? 0) > 0;
  const nextStatus = isPaid ? 'pending_payment' : 'confirmed';
  const extra = isPaid ? { payment_status: 'pending' } : {};

  const updateErr = await applyReview(admin, signup.id, reviewerId, {
    status: nextStatus,
    ...extra,
  });
  if (updateErr) {
    return err(`Update failed: ${updateErr}`, 500);
  }

  if (nextStatus === 'confirmed') {
    await markFullIfAtCapacity(admin, event.id);
  }

  await sendPush(admin, [signup.member_id], {
    title: nextStatus === 'confirmed' ? 'Sign-up confirmed' : 'Sign-up approved',
    body:
      nextStatus === 'confirmed'
        ? `You're in for ${event.title}`
        : `Approved — pay to confirm your place on ${event.title}`,
    data: {
      type: 'signup_reviewed',
      event_id: event.id,
      signup_id: signup.id,
      status: nextStatus,
    },
  });

  return ok({ signup_id: signup.id, status: nextStatus });
}

async function routeToWaitlist(
  admin: SupabaseClient,
  signup: LoadedSignup,
  event: ReviewEvent,
  reviewerId: string,
): Promise<Response> {
  const updateErr = await applyReview(admin, signup.id, reviewerId, { status: 'waitlisted' });
  if (updateErr) {
    return err(`Update failed: ${updateErr}`, 500);
  }
  await sendPush(admin, [signup.member_id], {
    title: 'Moved to waitlist',
    body: `${event.title} filled up before your sign-up was approved`,
    data: {
      type: 'signup_reviewed',
      event_id: event.id,
      signup_id: signup.id,
      status: 'waitlisted',
    },
  });
  return ok({
    signup_id: signup.id,
    status: 'waitlisted',
    message: 'Event is now full — moved to waitlist',
  });
}

// ---------- Shared helpers ----------

async function isAtCapacity(admin: SupabaseClient, event: ReviewEvent): Promise<boolean> {
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

async function applyReview(
  admin: SupabaseClient,
  signupId: string,
  reviewerId: string,
  patch: Record<string, unknown>,
): Promise<string | null> {
  const { error } = await admin
    .from('event_signups')
    .update({
      ...patch,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', signupId);
  return error?.message ?? null;
}
