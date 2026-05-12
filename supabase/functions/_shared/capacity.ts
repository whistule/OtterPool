import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  const { count } = await admin
    .from('event_signups')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'confirmed');
  if ((count ?? 0) >= ev.max_participants) {
    await admin.from('events').update({ status: 'full' }).eq('id', eventId);
  }
}
