// Pushes a new-event notice to everyone subscribed to the event's category.
// Invoked fire-and-forget from the client right after an event row is inserted.
// Subscribers are profiles whose `notify_category_ids` contains the event's
// category id, who meet the minimum level, and who aren't the leader.

import { corsHeaders } from '../_shared/cors.ts';
import { createClients } from '../_shared/supabase.ts';
import { ok, err } from '../_shared/response.ts';
import { meetsLevel } from '../_shared/progression.ts';
import { sendPush } from '../_shared/push.ts';

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
      .select('id, title, category_id, min_level, leader_id, status')
      .eq('id', event_id)
      .maybeSingle();

    if (!event) {
      return err('Event not found', 404);
    }
    if (event.leader_id !== user.id) {
      return err('Only the event leader can announce this event', 403);
    }
    if (!event.category_id) {
      return ok({ notified: 0 });
    }
    if (event.status === 'draft' || event.status === 'cancelled') {
      return ok({ notified: 0 });
    }

    const { data: subscribers } = await admin
      .from('profiles')
      .select('id, level')
      .contains('notify_category_ids', [event.category_id])
      .neq('id', event.leader_id);

    const eligibleIds = (subscribers ?? [])
      .filter((p) => meetsLevel(p.level, event.min_level))
      .map((p) => p.id);

    if (eligibleIds.length > 0) {
      await sendPush(admin, eligibleIds, {
        title: 'New trip posted',
        body: event.title,
        data: { type: 'event_created', event_id: event.id },
      });
    }

    return ok({ notified: eligibleIds.length });
  } catch (e) {
    return err(`Internal error: ${String(e)}`, 500);
  }
});
