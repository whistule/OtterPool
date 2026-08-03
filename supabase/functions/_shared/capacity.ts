import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** How many seats on this event are actually taken. */
export async function confirmedCount(admin: SupabaseClient, eventId: string): Promise<number> {
  const { count } = await admin
    .from('event_signups')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'confirmed');
  return count ?? 0;
}

/**
 * True when the event can take no more confirmed sign-ups.
 *
 * A 'full' status counts even without a cap: markFullIfAtCapacity has already
 * made that call, and a leader can set it by hand.
 */
export async function isAtCapacity(
  admin: SupabaseClient,
  event: { id: string; status: string; max_participants: number | null },
): Promise<boolean> {
  if (event.status === 'full') {
    return true;
  }
  if (!event.max_participants) {
    return false;
  }
  return (await confirmedCount(admin, event.id)) >= event.max_participants;
}

/**
 * If the event has a cap and confirmed sign-ups now meet it, flip status open→full.
 * No-op if the event is uncapped, already full, draft, cancelled, etc. — only
 * touches rows in `open` status so we don't clobber leader-set states.
 */
export async function markFullIfAtCapacity(admin: SupabaseClient, eventId: string): Promise<void> {
  const { data: ev } = await admin
    .from('events')
    .select('max_participants, status')
    .eq('id', eventId)
    .maybeSingle();
  if (!ev || ev.status !== 'open' || !ev.max_participants) {
    return;
  }
  if ((await confirmedCount(admin, eventId)) >= ev.max_participants) {
    await admin.from('events').update({ status: 'full' }).eq('id', eventId);
  }
}
