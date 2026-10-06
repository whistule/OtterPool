import type { Href } from 'expo-router';

import { supabase } from '@/lib/supabase';

export type AttentionItem = {
  key: string;
  title: string;
  detail: string;
  href: Href;
};

type EventRef = { id: string; title: string; starts_at: string; status: string };

// What needs the user's attention right now, derived from live state rather
// than a stored feed, so an item disappears as soon as it's dealt with.
export async function loadAttention(
  userId: string,
  paddlingAdmin: boolean,
): Promise<{ items: AttentionItem[]; error: string | null }> {
  const now = new Date().toISOString();
  const [reviewRes, mineRes, levelRes] = await Promise.all([
    supabase
      .from('event_signups')
      .select('event:events!inner(id, title, starts_at, status)')
      .eq('status', 'pending_review')
      .eq('event.leader_id', userId)
      .gte('event.starts_at', now),
    supabase
      .from('event_signups')
      .select('status, event:events!inner(id, title, starts_at, status)')
      .eq('member_id', userId)
      .in('status', ['pending_payment', 'waitlisted'])
      .gte('event.starts_at', now),
    paddlingAdmin
      ? supabase.rpc('admin_pending_experience')
      : Promise.resolve({ data: [], error: null }),
  ]);

  const error = reviewRes.error ?? mineRes.error ?? levelRes.error;
  if (error) {
    return { items: [], error: error.message };
  }

  const items: AttentionItem[] = [];

  const pendingByEvent = new Map<string, { event: EventRef; count: number }>();
  for (const row of (reviewRes.data ?? []) as unknown as { event: EventRef }[]) {
    const entry = pendingByEvent.get(row.event.id) ?? { event: row.event, count: 0 };
    entry.count += 1;
    pendingByEvent.set(row.event.id, entry);
  }
  for (const { event, count } of pendingByEvent.values()) {
    items.push({
      key: `review-${event.id}`,
      title: event.title,
      detail: count === 1 ? '1 sign-up to review' : `${count} sign-ups to review`,
      href: `/event/${event.id}/review`,
    });
  }

  for (const row of (mineRes.data ?? []) as unknown as { status: string; event: EventRef }[]) {
    if (row.status === 'pending_payment') {
      items.push({
        key: `pay-${row.event.id}`,
        title: row.event.title,
        detail: 'Pay to confirm your place',
        href: `/event/${row.event.id}`,
      });
    } else if (row.event.status === 'open') {
      // Same rule as the event screen's canClaim: waitlisted on an open trip.
      items.push({
        key: `seat-${row.event.id}`,
        title: row.event.title,
        detail: 'A place has opened up. Sign up again to claim it',
        href: `/event/${row.event.id}`,
      });
    }
  }

  for (const m of (levelRes.data ?? []) as {
    id: string;
    full_name: string | null;
    display_name: string | null;
  }[]) {
    items.push({
      key: `level-${m.id}`,
      title: m.full_name ?? m.display_name ?? 'Member',
      detail: 'Asked for a level review',
      href: `/profile/${m.id}`,
    });
  }

  return { items, error: null };
}
