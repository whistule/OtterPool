// Promote the oldest waitlisted signup to confirmed when a seat frees up.
// Free events: flip waitlisted → confirmed and push.
// Paid events: don't auto-confirm (they haven't paid) — push a "seat opened"
// offer instead so the member can re-engage through the normal sign-up flow.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPush } from './push.ts';

export async function promoteFromWaitlist(admin: SupabaseClient, eventId: string): Promise<void> {
  const { data: ev } = await admin
    .from('events')
    .select('id, title, max_participants, status, cost')
    .eq('id', eventId)
    .maybeSingle();
  if (!ev) {
    return;
  }

  // If the event was previously full, drop it back to open so the UI updates.
  if (ev.status === 'full') {
    await admin.from('events').update({ status: 'open' }).eq('id', eventId);
  }

  if (ev.max_participants) {
    const { count } = await admin
      .from('event_signups')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'confirmed');
    if ((count ?? 0) >= ev.max_participants) {
      return;
    }
  }

  const { data: next } = await admin
    .from('event_signups')
    .select('id, member_id')
    .eq('event_id', eventId)
    .eq('status', 'waitlisted')
    .order('signed_up_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!next) {
    return;
  }

  const isPaid = Number(ev.cost ?? 0) > 0;
  if (isPaid) {
    await sendPush(admin, [next.member_id], {
      title: 'A seat just opened',
      body: `${ev.title} — sign up again to grab your spot.`,
      data: { type: 'waitlist_offer', event_id: eventId, signup_id: next.id },
    });
    return;
  }

  const { error: promoteErr } = await admin
    .from('event_signups')
    .update({ status: 'confirmed' })
    .eq('id', next.id)
    .eq('status', 'waitlisted');
  if (promoteErr) {
    console.error('[waitlist] promote failed', promoteErr.message);
    return;
  }

  await sendPush(admin, [next.member_id], {
    title: "You're off the waitlist",
    body: `A seat opened on ${ev.title} — you're confirmed.`,
    data: { type: 'waitlist_promoted', event_id: eventId, signup_id: next.id },
  });
}
