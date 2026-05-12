// Pushes a cancellation notice to everyone with an active sign-up on an event.
// Caller (the leader, in the mobile app) invokes this *before* deleting the
// event row — once the row is gone we'd lose the title and signup list.
// The function does NOT delete anything itself; deletion stays client-side
// alongside the photo cleanup.

import { corsHeaders } from '../_shared/cors.ts';
import { createClients } from '../_shared/supabase.ts';
import { ok, err } from '../_shared/response.ts';
import { sendPush } from '../_shared/push.ts';
import { isAdmin } from '../_shared/authz.ts';

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

    const { event_id } = await req.json();
    if (!event_id) {
      return err('event_id is required', 400);
    }

    const { data: event } = await admin
      .from('events')
      .select('id, title, leader_id, starts_at')
      .eq('id', event_id)
      .maybeSingle();

    if (!event) {
      return err('Event not found', 404);
    }

    // Only the leader (or an admin) can fire a cancellation notice.
    if (event.leader_id !== user.id && !(await isAdmin(admin, user.id))) {
      return err('Only the event leader can cancel this event', 403);
    }

    const { data: signups } = await admin
      .from('event_signups')
      .select('member_id, status')
      .eq('event_id', event_id)
      .not('status', 'in', '(withdrawn,declined)');

    const memberIds = Array.from(new Set((signups ?? []).map((s) => s.member_id))).filter(
      (id) => id !== event.leader_id,
    );

    if (memberIds.length > 0) {
      await sendPush(admin, memberIds, {
        title: 'Event cancelled',
        body: `${event.title} has been cancelled by the leader.`,
        data: { type: 'event_cancelled', event_id: event.id },
      });
    }

    return ok({ notified: memberIds.length });
  } catch (e) {
    return err(`Internal error: ${String(e)}`, 500);
  }
});
