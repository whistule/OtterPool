import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * How many seats on this event are spoken for.
 *
 * A 'pending_payment' row is a held seat, not a spare one — the member is on
 * the Stripe checkout page and the webhook will confirm them. Counting only
 * 'confirmed' let every member of a full paid trip open checkout at once and
 * all get charged for a seat that didn't exist.
 *
 * ponytail: a held seat is released by the payment_intent.canceled webhook,
 * which Stripe fires when the checkout session expires (~24h). If that ever
 * proves too slow, sweep pending_payment rows older than the session TTL.
 */
export async function confirmedCount(
  admin: SupabaseClient,
  eventId: string,
  /** Ignore this member's own seat — they're resuming their own checkout. */
  excludeMemberId?: string,
): Promise<number> {
  let q = admin
    .from('event_signups')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .in('status', ['confirmed', 'pending_payment']);
  if (excludeMemberId) {
    q = q.neq('member_id', excludeMemberId);
  }
  const { count } = await q;
  return count ?? 0;
}

/** True when the event has no seat left to give out. */
export async function isAtCapacity(
  admin: SupabaseClient,
  event: { id: string; status: string; max_participants: number | null },
  /** The member being routed, so their own held seat doesn't lock them out. */
  excludeMemberId?: string,
): Promise<boolean> {
  // Uncapped: 'full' is the leader's own call and stands.
  if (!event.max_participants) {
    return event.status === 'full';
  }
  // Capped: the seat count is the truth. Short-circuit on 'full' only when
  // nobody is excluded — a member resuming their own checkout must not be
  // locked out by the very seat they're holding, which is what flipped the
  // event to 'full' in the first place.
  if (event.status === 'full' && !excludeMemberId) {
    return true;
  }
  return (await confirmedCount(admin, event.id, excludeMemberId)) >= event.max_participants;
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
