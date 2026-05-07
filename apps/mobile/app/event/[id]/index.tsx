import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
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

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [eventRes, signupRes, pendingRes, participantsRes] = await Promise.all([
      supabase
        .from('events')
        .select(
          'id, title, description, category_id, grade_advertised, starts_at, ends_at, location, meeting_point, min_level, max_participants, cost, status, approval_mode, leader_id, photo_path, category:event_categories(name), leader:profiles!events_leader_id_fkey(display_name, full_name, level, avatar_path)'
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

    if (!eventRes.error) setEvent((eventRes.data as unknown as EventRow) ?? null);
    if (!signupRes.error) setSignup((signupRes.data as Signup) ?? null);
    if (!pendingRes.error) setPendingReviewCount(pendingRes.count ?? 0);
    if (!participantsRes.error)
      setParticipants((participantsRes.data as Participant[]) ?? []);
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
      return; // user is leaving the screen; don't clear busy
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

  const leaderName =
    event.leader?.display_name ?? event.leader?.full_name ?? '—';
  const levelEmoji = LEVEL_EMOJI[event.min_level] ?? '🦆';
  const isPaid = Number(event.cost) > 0;
  const isLeader = !!session && session.user.id === event.leader_id;

  const isPending = signup?.status === 'pending_payment';
  const isLeaderApproved = isPending && event.approval_mode === 'manual_all';

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

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Header onBack={() => router.back()} />

        <View style={styles.heroWrap}>
          <EventPhoto path={event.photo_path} height={140} style={styles.hero} />
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          <Text style={[styles.title, { color: palette.text }]}>{event.title}</Text>
          {event.category?.name ? (
            <Text style={[styles.category, { color: palette.muted }]}>
              {event.category.name}
            </Text>
          ) : null}

          <Row style={{ flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
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

        <SectionTitle>When</SectionTitle>
        <Card>
          <Text style={[styles.value, { color: palette.text }]}>
            {formatDateTime(event.starts_at)}
          </Text>
          {event.ends_at ? (
            <Text style={[styles.muted, { color: palette.muted, marginTop: 4 }]}>
              Ends {formatDateTime(event.ends_at)}
            </Text>
          ) : null}
        </Card>

        {event.location || event.meeting_point ? (
          <>
            <SectionTitle>Where</SectionTitle>
            <Card>
              {event.location ? (
                <Text style={[styles.value, { color: palette.text }]}>{event.location}</Text>
              ) : null}
              {event.meeting_point ? (
                <Text style={[styles.muted, { color: palette.muted, marginTop: 4 }]}>
                  Meet at {event.meeting_point}
                </Text>
              ) : null}
            </Card>
          </>
        ) : null}

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

        {event.description ? (
          <>
            <SectionTitle>Description</SectionTitle>
            <Card>
              <Text style={[styles.body, { color: palette.text }]}>{event.description}</Text>
            </Card>
          </>
        ) : null}

        {isLeader ? (
          <>
            <SectionTitle>Leader tools</SectionTitle>
            <Pressable
              testID="event-edit-cta"
              onPress={() => router.push(`/event/${id}/edit`)}>
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.value, { color: palette.text }]}>
                      Edit event
                    </Text>
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
                    <Text style={[styles.value, { color: palette.text }]}>
                      Review sign-ups
                    </Text>
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

        {signup && statusInfo ? (
          <>
            <SectionTitle>Your status</SectionTitle>
            <Card style={{ borderColor: statusInfo.color, borderWidth: 1.5 }}>
              <Text style={[styles.value, { color: statusInfo.color }]}>
                {statusInfo.label}
              </Text>
              <Text style={[styles.muted, { color: palette.muted, marginTop: 4 }]}>
                Signed up {formatDateTime(signup.signed_up_at)}
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

        {!isLeader && (!signup || isPending) ? (
          <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
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
                  ? `£${Number(event.cost).toFixed(0)} payment taken after the leader confirms your spot.`
                  : `Card payment of £${Number(event.cost).toFixed(0)} taken on sign-up.`}
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  const palette = Colors[useColorScheme() ?? 'light'];
  return (
    <View
      style={[
        styles.header,
        { backgroundColor: OtterPalette.slateNavy },
      ]}>
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
    marginBottom: 8,
  },
  backBtn: { paddingHorizontal: 8, paddingVertical: 4, minWidth: 56 },
  backText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  headerWordmark: { color: '#fff', fontSize: 14, fontStyle: 'italic', opacity: 0.85 },
  heroWrap: { paddingHorizontal: 16, marginBottom: 4 },
  hero: { width: '100%', borderRadius: 14 },
  title: { fontSize: 22, fontWeight: '700', marginTop: 16 },
  category: { fontSize: 13, marginTop: 4 },
  value: { fontSize: 15, fontWeight: '600' },
  muted: { fontSize: 12 },
  body: { fontSize: 14, lineHeight: 20 },
  errTitle: { fontSize: 14, fontWeight: '700' },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  payNote: { fontSize: 11, textAlign: 'center', marginTop: 10 },
});
