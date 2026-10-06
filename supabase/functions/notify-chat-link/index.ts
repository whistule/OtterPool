// Tell confirmed paddlers the trip WhatsApp is ready. The edit form calls this
// after a save that adds or changes the link; people confirmed from then on
// hear about it in their confirmation push instead (withTripChat).

import { corsHeaders } from '../_shared/cors.ts';
import { createClients } from '../_shared/supabase.ts';
import { ok, err } from '../_shared/response.ts';
import { isPaddlingAdmin } from '../_shared/authz.ts';
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
      .select('id, title, leader_id, assistant_id, status')
      .eq('id', event_id)
      .maybeSingle();
    if (!event) {
      return err('Event not found', 404);
    }
    // The same people the event_chat_links policy lets set the link.
    const canEdit =
      event.leader_id === user.id ||
      event.assistant_id === user.id ||
      (await isPaddlingAdmin(admin, user.id));
    if (!canEdit) {
      return err('Only the people running this trip can announce its WhatsApp', 403);
    }
    if (event.status === 'cancelled') {
      return ok({ notified: 0 });
    }

    const { data: link } = await admin
      .from('event_chat_links')
      .select('event_id')
      .eq('event_id', event.id)
      .maybeSingle();
    if (!link) {
      return ok({ notified: 0 });
    }

    const { data: signups } = await admin
      .from('event_signups')
      .select('member_id')
      .eq('event_id', event.id)
      .eq('status', 'confirmed')
      .neq('member_id', user.id);
    const memberIds = (signups ?? []).map((s) => s.member_id);

    await sendPush(admin, memberIds, {
      title: 'Trip WhatsApp ready',
      body: `Join the WhatsApp for ${event.title}`,
      data: { type: 'chat_link', event_id: event.id },
    });

    return ok({ notified: memberIds.length });
  } catch (e) {
    return err(`Internal error: ${String(e)}`, 500);
  }
});
