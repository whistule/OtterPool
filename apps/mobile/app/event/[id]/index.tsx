import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, EventPhoto } from '@/components/photo';
import { Card, Pill, Row, SectionTitle } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  category_id: number | null;
  grade_advertised: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  meeting_point: string | null;
  min_level: string;
  max_participants: number | null;
  cost: number;
  status: string;
  approval_mode: string;
  leader_id: string;
  photo_path: string | null;
  series_id: string | null;
  category?: { name: string } | null;
  leader?: {
    display_name: string | null;
    full_name: string | null;
    level: string;
    avatar_path: string | null;
  } | null;
};

type Signup = {
  id: string;
  status: string;
  signed_up_at: string;
  payment_status?: string | null;
};

type Participant = {
  member_id: string;
  display_name: string | null;
  full_name: string | null;
  level: string;
  signed_up_at: string;
  avatar_path: string | null;
};

type SignUpResponse = {
  signup: Signup;
  message: string;
  payment?: { checkout_url: string; amount_pence: number };
};

type SeriesSibling = { id: string; starts_at: string };

const LEVEL_EMOJI: Record<string, string> = {
  frog: '🐸',
  duck: '🦆',
  otter: '🦦',
  dolphin: '🐬',
  selkie: '🦭',
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  confirmed: { label: '✅ Confirmed', color: OtterPalette.forest },
  pending_payment: { label: '💳 Awaiting payment', color: OtterPalette.burntOrange },
  pending_review: { label: '⚠️ Pending leader review', color: OtterPalette.burntOrange },
  waitlisted: { label: '⏳ On waitlist', color: OtterPalette.lochPool },
  declined: { label: '✖️ Declined', color: OtterPalette.ice },
  withdrawn: { label: '↩️ Withdrawn', color: OtterPalette.lochPool },
};

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDateOnly(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatTimeOnly(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTimeFull(d: Date): string {
  return `${d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })} · ${formatTimeOnly(d)}`;
}

function formatRange(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  if (!endIso) return formatDateTimeFull(start);
  const end = new Date(endIso);
  if (sameDay(start, end)) {
    return `${formatDateOnly(start)} · ${formatTimeOnly(start)}–${formatTimeOnly(end)}`;
  }
  return `${formatDateTimeFull(start)} → ${formatDateTimeFull(end)}`;
}

function buildIcs(ev: EventRow): string {
  const stamp = (iso: string) =>
    new Date(iso)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d+/, '');
  const escape = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OtterPool//DCKC//EN',
    'BEGIN:VEVENT',
    `UID:${ev.id}@otterpool`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(ev.starts_at)}`,
    ev.ends_at ? `DTEND:${stamp(ev.ends_at)}` : null,
    `SUMMARY:${escape(ev.title)}`,
    ev.location ? `LOCATION:${escape(ev.location)}` : null,
    ev.description ? `DESCRIPTION:${escape(ev.description)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((l): l is string => l !== null);
  return lines.join('\r\n');
}

function downloadIcs(ev: EventRow) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const blob = new Blob([buildIcs(ev)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement('a');
  a.href = url;
  const safe = ev.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  a.download = `${safe || 'event'}.ics`;
  window.document.body.appendChild(a);
  a.click();
  window.document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openMaps(query: string) {
  const encoded = encodeURIComponent(query);
  const url = Platform.select({
    ios: `https://maps.apple.com/?q=${encoded}`,
    default: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
  });
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank');
    return;
  }
  Linking.openURL(url).catch(() => {});
}

async function readErrorMessage(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : String(error);
  if (
    error &&
    typeof error === 'object' &&
    'context' in error &&
    (error as { context?: unknown }).context instanceof Response
  ) {
    try {
      const body = await (error as { context: Response }).context.clone().json();
      return body?.error ?? body?.message ?? fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export default function EventDetailScreen() {
  const { id, paid, cancelled } = useLocalSearchParams<{
    id: string;
    paid?: string;
    cancelled?: string;
  }>();
  const palette = Colors[useColorScheme() ?? 'light'];
  const { session } = useAuth();

  const [event, setEvent] = useState<EventRow | null>(null);
  const [signup, setSignup] = useState<Signup | null>(null);
  const [pendingReviewCount, setPendingReviewCount] = useState<number>(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [series, setSeries] = useState<SeriesSibling[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [eventRes, signupRes, pendingRes, participantsRes] = await Promise.all([
      supabase
        .from('events')
        .select(
          'id, title, description, category_id, grade_advertised, starts_at, ends_at, location, meeting_point, min_level, max_participants, cost, status, approval_mode, leader_id, photo_path, series_id, category:event_categories(name), leader:profiles!events_leader_id_fkey(display_name, full_name, level, avatar_path)'
        )
        .eq('id', id)
        .maybeSingle(),
      session
        ? supabase
            .from('event_signups')
            .select('id, status, signed_up_at, payment_status')
            .eq('event_id', id)
            .eq('member_id', session.user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      session
        ? supabase
            .from('event_signups')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', id)
            .eq('status', 'pending_review')
        : Promise.resolve({ count: 0, error: null }),
      supabase
        .from('event_participants')
        .select('member_id, display_name, full_name, level, signed_up_at, avatar_path')
        .eq('event_id', id)
        .order('signed_up_at', { ascending: true }),
    ]);

    const ev = (eventRes.data as unknown as EventRow) ?? null;
    if (!eventRes.error) setEvent(ev);
    if (!signupRes.error) setSignup((signupRes.data as Signup) ?? null);
    if (!pendingRes.error) setPendingReviewCount(pendingRes.count ?? 0);
    if (!participantsRes.error)
      setParticipants((participantsRes.data as Participant[]) ?? []);

    if (ev?.series_id) {
      const { data: siblings } = await supabase
        .from('events')
        .select('id, starts_at')
        .eq('series_id', ev.series_id)
        .order('starts_at', { ascending: true });
      setSeries((siblings as SeriesSibling[]) ?? []);
    } else {
      setSeries([]);
    }
    setLoading(false);
  }, [id, session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Returning from Stripe Checkout — poll briefly while the webhook flips the row.
  useEffect(() => {
    if (paid !== '1') return;
    setFeedback({ type: 'ok', msg: 'Payment received — confirming your sign-up…' });
    let stopped = false;
    (async () => {
      for (let i = 0; i < 8 && !stopped; i++) {
        await new Promise((r) => setTimeout(r, 700));
        await load();
      }
    })();
    return () => {
      stopped = true;
    };
  }, [paid, load]);

  useEffect(() => {
    if (cancelled === '1') {
      setFeedback({ type: 'err', msg: 'Payment cancelled. You can try again.' });
    }
  }, [cancelled]);

  const seriesInfo = useMemo(() => {
    if (!event?.series_id || series.length < 2) return null;
    const idx = series.findIndex((s) => s.id === event.id);
    const now = new Date();
    const next = series.find((s, i) => i > idx && new Date(s.starts_at) > now);
    return {
      index: idx + 1,
      total: series.length,
      next,
    };
  }, [event, series]);

  const handleSignUp = async () => {
    if (!id) return;
    setBusy(true);
    setFeedback(null);

    const returnUrl =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.origin}/event/${id}`
        : `otterpool://event/${id}`;

    const { data, error } = await supabase.functions.invoke<SignUpResponse>('sign-up', {
      body: { event_id: id, return_url: returnUrl },
    });
    if (error) {
      const msg = await readErrorMessage(error);
      setFeedback({ type: 'err', msg });
      setBusy(false);
      return;
    }

    if (data?.payment?.checkout_url) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = data.payment.checkout_url;
      } else {
        await Linking.openURL(data.payment.checkout_url);
      }
      return;
    }

    setFeedback({ type: 'ok', msg: data?.message ?? 'Signed up' });
    await load();
    setBusy(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator color={palette.tint} />
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
        <Header onBack={() => router.back()} />
        <Card>
          <Text style={[styles.errTitle, { color: OtterPalette.ice }]}>Event not found</Text>
        </Card>
      </SafeAreaView>
    );
  }

  const leaderName = event.leader?.display_name ?? event.leader?.full_name ?? '—';
  const levelEmoji = LEVEL_EMOJI[event.min_level] ?? '🦆';
  const isPaid = Number(event.cost) > 0;
  const isLeader = !!session && session.user.id === event.leader_id;

  const isPending = signup?.status === 'pending_payment';
  const isLeaderApproved = isPending && event.approval_mode === 'manual_all';
  const isConfirmed = signup?.status === 'confirmed';

  const statusInfo = signup
    ? isLeaderApproved
      ? {
          label: `✅ Approved — pay £${Number(event.cost).toFixed(0)} to confirm`,
          color: OtterPalette.forest,
        }
      : STATUS_LABEL[signup.status]
    : null;

  const canSignUp =
    (!signup || isPending) &&
    !busy &&
    (event.status === 'open' || event.status === 'full');

  let primaryLabel = 'Sign up';
  if (event.status === 'full') primaryLabel = 'Join waitlist';
  if (event.status === 'cancelled') primaryLabel = 'Cancelled';
  if (event.status === 'closed') primaryLabel = 'Closed';
  if (event.status === 'draft') primaryLabel = 'Not yet open';
  if (isPending) {
    primaryLabel = isLeaderApproved
      ? `Pay £${Number(event.cost).toFixed(0)} to confirm`
      : `Pay £${Number(event.cost).toFixed(0)}`;
  }

  const showFooterCta = !isLeader && (!signup || isPending);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: showFooterCta ? 24 : 32 }}>
        <Header onBack={() => router.back()} />

        {/* ---------- Hero with title overlay ---------- */}
        <View style={styles.hero}>
          <EventPhoto path={event.photo_path} height={220} style={styles.heroPhoto} />
          <View style={styles.heroOverlay} pointerEvents="none" />
          <View style={styles.heroContent} pointerEvents="none">
            {event.category?.name ? (
              <Text style={styles.heroCategory}>{event.category.name}</Text>
            ) : null}
            <Text style={styles.heroTitle} numberOfLines={3}>
              {event.title}
            </Text>
          </View>
        </View>

        {/* ---------- Pills row under hero ---------- */}
        <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
          <Row style={{ flexWrap: 'wrap', gap: 6 }}>
            {event.grade_advertised ? (
              <Pill label={event.grade_advertised} color={OtterPalette.slateNavy} />
            ) : null}
            <Pill
              label={`${levelEmoji} ${event.min_level} min`}
              color="#e3e1dc"
              textStyle={{ color: '#2a2f33' }}
            />
            <Pill
              label={isPaid ? `£${Number(event.cost).toFixed(0)}` : 'Free'}
              color={isPaid ? OtterPalette.burntOrange : OtterPalette.forest}
            />
            <Pill
              label={event.approval_mode === 'manual_all' ? 'Manual review' : 'Auto-approve'}
              color={palette.surface}
              textStyle={{ color: palette.text }}
            />
          </Row>
        </View>

        {/* ---------- Series banner ---------- */}
        {seriesInfo ? (
          <Pressable
            disabled={!seriesInfo.next}
            onPress={() =>
              seriesInfo.next ? router.push(`/event/${seriesInfo.next.id}`) : undefined
            }
            testID="event-series-next">
            <Card
              style={{
                borderColor: OtterPalette.slateNavy,
                borderWidth: 1.5,
                backgroundColor: palette.surface,
              }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.value, { color: palette.text }]}>
                    Repeats · {seriesInfo.index} of {seriesInfo.total}
                  </Text>
                  <Text style={[styles.muted, { color: palette.muted, marginTop: 4 }]}>
                    {seriesInfo.next
                      ? `Next: ${formatDateTimeFull(new Date(seriesInfo.next.starts_at))}`
                      : 'This is the last occurrence in the series'}
                  </Text>
                </View>
                {seriesInfo.next ? (
                  <Text style={[styles.value, { color: OtterPalette.slateNavy }]}>›</Text>
                ) : null}
              </Row>
            </Card>
          </Pressable>
        ) : null}

        {/* ---------- When ---------- */}
        <SectionTitle>When</SectionTitle>
        <Card>
          <Text style={[styles.value, { color: palette.text }]}>
            {formatRange(event.starts_at, event.ends_at)}
          </Text>
          {isConfirmed && Platform.OS === 'web' ? (
            <Pressable
              testID="event-add-to-calendar"
              onPress={() => downloadIcs(event)}
              style={{ marginTop: 8, alignSelf: 'flex-start' }}>
              <Text style={[styles.linkText, { color: OtterPalette.slateNavy }]}>
                + Add to your calendar
              </Text>
            </Pressable>
          ) : null}
        </Card>

        {/* ---------- Where ---------- */}
        {event.location || event.meeting_point ? (
          <>
            <SectionTitle>Where</SectionTitle>
            <Card>
              {event.location ? (
                <Pressable
                  onPress={() => openMaps(event.location ?? '')}
                  testID="event-location">
                  <Text style={[styles.value, styles.linkText, { color: OtterPalette.slateNavy }]}>
                    {event.location}
                  </Text>
                </Pressable>
              ) : null}
              {event.meeting_point ? (
                <Pressable
                  onPress={() =>
                    openMaps(`${event.meeting_point}${event.location ? ', ' + event.location : ''}`)
                  }
                  testID="event-meeting-point"
                  style={{ marginTop: event.location ? 6 : 0 }}>
                  <Text style={[styles.muted, styles.linkText, { color: OtterPalette.slateNavy }]}>
                    Meet at {event.meeting_point} ↗
                  </Text>
                </Pressable>
              ) : null}
            </Card>
          </>
        ) : null}

        {/* ---------- Leader ---------- */}
        <SectionTitle>Leader</SectionTitle>
        <Pressable onPress={() => router.push(`/profile/${event.leader_id}`)}>
          <Card>
            <Row style={{ gap: 12 }}>
              <Avatar
                path={event.leader?.avatar_path ?? null}
                size={44}
                fallback={event.leader?.level ? LEVEL_EMOJI[event.leader.level] : undefined}
              />
              <View>
                <Text style={[styles.value, { color: palette.text }]}>{leaderName}</Text>
                {event.leader?.level ? (
                  <Text style={[styles.muted, { color: palette.muted }]}>
                    {LEVEL_EMOJI[event.leader.level] ?? ''} {event.leader.level}
                  </Text>
                ) : null}
              </View>
            </Row>
          </Card>
        </Pressable>

        {/* ---------- Going ---------- */}
        <SectionTitle>
          {`Going${
            event.max_participants
              ? ` · ${participants.length}/${event.max_participants}`
              : participants.length > 0
                ? ` · ${participants.length}`
                : ''
          }`}
        </SectionTitle>
        {participants.length === 0 ? (
          <Card>
            <Text style={[styles.muted, { color: palette.muted }]}>
              No one confirmed yet — be the first.
            </Text>
          </Card>
        ) : (
          participants.map((p) => {
            const name = p.display_name ?? p.full_name ?? 'Member';
            const emoji = LEVEL_EMOJI[p.level] ?? '🦦';
            return (
              <Pressable
                key={p.member_id}
                onPress={() => router.push(`/profile/${p.member_id}`)}>
                <Card>
                  <Row style={{ gap: 12 }}>
                    <Avatar path={p.avatar_path} size={36} fallback={emoji} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.value, { color: palette.text }]}>{name}</Text>
                      <Text style={[styles.muted, { color: palette.muted }]}>
                        {emoji} {p.level}
                      </Text>
                    </View>
                  </Row>
                </Card>
              </Pressable>
            );
          })
        )}

        {/* ---------- Description ---------- */}
        {event.description ? (
          <>
            <SectionTitle>Description</SectionTitle>
            <Card>
              <Text style={[styles.body, { color: palette.text }]}>{event.description}</Text>
            </Card>
          </>
        ) : null}

        {/* ---------- Leader tools ---------- */}
        {isLeader ? (
          <>
            <SectionTitle>Leader tools</SectionTitle>
            <Pressable
              testID="event-edit-cta"
              onPress={() => router.push(`/event/${id}/edit`)}>
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.value, { color: palette.text }]}>Edit event</Text>
                    <Text style={[styles.muted, { color: palette.muted, marginTop: 4 }]}>
                      Update details, photo, status or capacity
                    </Text>
                  </View>
                  <Text style={[styles.value, { color: palette.muted }]}>›</Text>
                </Row>
              </Card>
            </Pressable>
            <Pressable
              testID="event-review-cta"
              onPress={() => router.push(`/event/${id}/review`)}>
              <Card style={{ borderColor: OtterPalette.burntOrange, borderWidth: 1.5 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.value, { color: palette.text }]}>Review sign-ups</Text>
                    <Text style={[styles.muted, { color: palette.muted, marginTop: 4 }]}>
                      {pendingReviewCount === 0
                        ? 'No one waiting for review'
                        : `${pendingReviewCount} ${
                            pendingReviewCount === 1 ? 'person' : 'people'
                          } waiting for review`}
                    </Text>
                  </View>
                  <Text style={[styles.value, { color: OtterPalette.burntOrange }]}>›</Text>
                </Row>
              </Card>
            </Pressable>
          </>
        ) : null}

        {/* ---------- Your status ---------- */}
        {signup && statusInfo ? (
          <>
            <SectionTitle>Your status</SectionTitle>
            <Card style={{ borderColor: statusInfo.color, borderWidth: 1.5 }}>
              <Text style={[styles.value, { color: statusInfo.color }]}>
                {statusInfo.label}
              </Text>
              <Text style={[styles.muted, { color: palette.muted, marginTop: 4 }]}>
                Signed up {formatDateTimeFull(new Date(signup.signed_up_at))}
              </Text>
              {isPaid && signup.status === 'confirmed' ? (
                <Text style={[styles.muted, { color: palette.muted, marginTop: 6 }]}>
                  Payment received · £{Number(event.cost).toFixed(0)}
                </Text>
              ) : null}
              {signup.status === 'pending_payment' ? (
                <Text style={[styles.muted, { color: palette.muted, marginTop: 6 }]}>
                  {isLeaderApproved
                    ? `The leader has approved your sign-up. Pay £${Number(event.cost).toFixed(0)} below to lock in your spot.`
                    : 'Tap "Sign up" again to resume payment if the sheet was dismissed.'}
                </Text>
              ) : null}
            </Card>
          </>
        ) : null}

        {feedback ? (
          <Card
            style={{
              borderWidth: 1.5,
              borderColor: feedback.type === 'ok' ? OtterPalette.forest : OtterPalette.ice,
            }}>
            <Text
              style={[
                styles.body,
                { color: feedback.type === 'ok' ? OtterPalette.forest : OtterPalette.ice },
              ]}>
              {feedback.msg}
            </Text>
          </Card>
        ) : null}
      </ScrollView>

      {/* ---------- Sticky footer CTA ---------- */}
      {showFooterCta ? (
        <View
          style={[
            styles.footer,
            { backgroundColor: palette.background, borderTopColor: palette.border },
          ]}>
          <Pressable
            testID="event-primary-cta"
            onPress={canSignUp ? handleSignUp : undefined}
            disabled={!canSignUp}
            style={[
              styles.primaryBtn,
              {
                backgroundColor: canSignUp ? OtterPalette.slateNavy : '#9aa3ac',
                opacity: busy ? 0.7 : 1,
              },
            ]}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
            )}
          </Pressable>
          {isPaid && !isPending ? (
            <Text style={[styles.payNote, { color: palette.muted }]}>
              {event.approval_mode === 'manual_all'
                ? `£${Number(event.cost).toFixed(0)} taken after the leader confirms your spot.`
                : `Card payment of £${Number(event.cost).toFixed(0)} taken on sign-up.`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={[styles.header, { backgroundColor: OtterPalette.slateNavy }]}>
      <Pressable testID="event-back" onPress={onBack} style={styles.backBtn}>
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>
      <Text style={styles.headerWordmark}>OtterPool</Text>
      <View style={styles.backBtn} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backBtn: { paddingHorizontal: 8, paddingVertical: 4, minWidth: 56 },
  backText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  headerWordmark: { color: '#fff', fontSize: 14, fontStyle: 'italic', opacity: 0.85 },
  hero: {
    width: '100%',
    height: 220,
    backgroundColor: OtterPalette.slateNavy,
    overflow: 'hidden',
    position: 'relative',
  },
  heroPhoto: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    ...(Platform.OS === 'web'
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({
          backgroundImage:
            'linear-gradient(to bottom, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.65) 100%)',
          backgroundColor: 'transparent',
        } as any)
      : null),
  },
  heroContent: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 16,
  },
  heroCategory: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 28,
  },
  value: { fontSize: 15, fontWeight: '600' },
  muted: { fontSize: 12 },
  body: { fontSize: 14, lineHeight: 20 },
  errTitle: { fontSize: 14, fontWeight: '700' },
  linkText: {
    textDecorationLine: 'underline',
  },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  payNote: { fontSize: 11, textAlign: 'center', marginTop: 10 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
    borderTopWidth: 1,
  },
});
