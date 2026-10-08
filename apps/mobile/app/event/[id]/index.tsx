import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Header } from '@/components/header';
import { WhatsAppButton } from '@/components/whatsapp-button';
import { PageTitle } from '@/components/page-title';
import { Avatar, EventPhoto } from '@/components/photo';
import { ErrorCard, LoadingCenter } from '@/components/screen-states';
import { Card, Pill, Row, SectionTitle } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { roleFlags, useAuth } from '@/lib/auth';
import { readErrorMessage } from '@/lib/errors';
import { categoryChip } from '@/lib/event-form-utils';
import { formatDateTime, formatFullRange } from '@/lib/datetime';
import { openKitChecklist, parseKitList } from '@/lib/kit-list';
import { formatMoney, formatPence, parsePriceOptions } from '@/lib/money';
import { cancelEventReminder, scheduleEventReminder } from '@/lib/notifications';
import { hasAnyAnswer } from '@/lib/experience';
import {
  isCredibilityGrade,
  LEVEL_EMOJI,
  LEVEL_LABEL,
  LEVEL_RANK,
  type ProgressionLevel,
} from '@/lib/progress';
import { webRouteUrl } from '@/lib/urls';
import { SIGNUP_STATUS, type SignupStatus } from '@/lib/status';
import { supabase, supabaseUrl } from '@/lib/supabase';

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  what_to_bring: string | null;
  category_id: number | null;
  grade_advertised: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  meeting_point: string | null;
  meeting_time: string | null;
  put_in_point: string | null;
  put_in_time: string | null;
  min_level: string;
  max_participants: number | null;
  cost: number;
  price_options: unknown;
  status: string;
  approval_mode: string;
  leader_id: string;
  assistant_id: string | null;
  photo_path: string | null;
  series_id: string | null;
  category?: { name: string } | null;
  leader?: {
    display_name: string | null;
    full_name: string | null;
    level: string;
    avatar_path: string | null;
  } | null;
  assistant?: {
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
  amount_paid_pence?: number | null;
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

function buildIcs(ev: EventRow): string {
  const stamp = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const escapeIcs = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OtterPool//DCKC//EN',
    'BEGIN:VEVENT',
    `UID:${ev.id}@otterpool`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(ev.starts_at)}`,
    ev.ends_at ? `DTEND:${stamp(ev.ends_at)}` : null,
    `SUMMARY:${escapeIcs(ev.title)}`,
    ev.location ? `LOCATION:${escapeIcs(ev.location)}` : null,
    ev.description ? `DESCRIPTION:${escapeIcs(ev.description)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((l): l is string => l !== null);
  return lines.join('\r\n');
}

function downloadIcs(ev: EventRow) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }
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

export default function EventDetailScreen() {
  const { id, paid, cancelled, created } = useLocalSearchParams<{
    id: string;
    paid?: string;
    cancelled?: string;
    created?: string;
  }>();
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();

  const [event, setEvent] = useState<EventRow | null>(null);
  const [signup, setSignup] = useState<Signup | null>(null);
  const [pendingReviewCount, setPendingReviewCount] = useState<number>(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  // RLS only returns it to leaders, paddling admins and confirmed attendees.
  const [chatUrl, setChatUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  // Index into the event's concession price tiers (0 = standard rate).
  const [priceOption, setPriceOption] = useState(0);

  const load = useCallback(async () => {
    if (!id) {
      return;
    }
    const [eventRes, signupRes, pendingRes, participantsRes, chatRes] = await Promise.all([
      supabase
        .from('events')
        .select(
          'id, title, description, what_to_bring, category_id, grade_advertised, starts_at, ends_at, location, meeting_point, meeting_time, put_in_point, put_in_time, min_level, max_participants, cost, price_options, status, approval_mode, leader_id, assistant_id, photo_path, series_id, category:event_categories(name), leader:profiles!events_leader_id_fkey(display_name, full_name, level, avatar_path), assistant:profiles!events_assistant_id_fkey(display_name, full_name, level, avatar_path)',
        )
        .eq('id', id)
        .maybeSingle(),
      session
        ? supabase
            .from('event_signups')
            .select('id, status, signed_up_at, payment_status, amount_paid_pence')
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
      supabase.from('event_chat_links').select('url').eq('event_id', id).maybeSingle(),
    ]);

    const ev = (eventRes.data as unknown as EventRow) ?? null;
    if (!eventRes.error) {
      setEvent(ev);
    }
    if (!signupRes.error) {
      setSignup((signupRes.data as Signup) ?? null);
    }
    if (!pendingRes.error) {
      setPendingReviewCount(pendingRes.count ?? 0);
    }
    if (!participantsRes.error) {
      setParticipants((participantsRes.data as Participant[]) ?? []);
    }
    if (!chatRes.error) {
      setChatUrl(chatRes.data?.url ?? null);
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
    if (paid !== '1') {
      return;
    }
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

  useEffect(() => {
    if (!event) {
      return;
    }
    if (signup?.status === 'confirmed') {
      scheduleEventReminder(event.id, event.title, event.starts_at).catch(() => {});
    } else {
      cancelEventReminder(event.id).catch(() => {});
    }
  }, [signup?.status, event]);

  const handleSignUp = async () => {
    if (!id) {
      return;
    }
    setBusy(true);
    setFeedback(null);

    // Stripe Checkout requires http(s) for success_url / cancel_url, so native
    // can't pass `otterpool://...` directly. On native we route through the
    // payment-return edge function, which 302s into the app's custom scheme.
    const returnUrl =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? webRouteUrl(`/event/${id}`)
        : `${supabaseUrl}/functions/v1/payment-return?event_id=${id}`;

    // Only send a tier index when the event has tiers; the server ignores it
    // otherwise and always resolves the amount from the event itself.
    const tiers = event ? parsePriceOptions(event.price_options) : [];
    const chosenTier =
      tiers.length > 0 ? Math.min(Math.max(priceOption, 0), tiers.length - 1) : null;

    const { data, error } = await supabase.functions.invoke<SignUpResponse>('sign-up', {
      body: {
        event_id: id,
        return_url: returnUrl,
        ...(chosenTier !== null ? { price_option: chosenTier } : {}),
      },
    });
    if (error) {
      const msg = await readErrorMessage(error);
      setFeedback({ type: 'err', msg });
      setBusy(false);
      return;
    }

    if (data?.payment?.checkout_url) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // Page is navigating away, so leave the button busy.
        window.location.href = data.payment.checkout_url;
        return;
      }
      // Native keeps this screen mounted behind the browser. Clear busy now,
      // or the CTA is stuck spinning when the member comes back — load() on
      // focus doesn't touch it.
      await Linking.openURL(data.payment.checkout_url).catch(() => {});
      setBusy(false);
      return;
    }

    setFeedback({ type: 'ok', msg: data?.message ?? 'Signed up' });
    await load();
    setBusy(false);
  };

  const handleCancelSignup = async () => {
    if (!signup) {
      return;
    }
    setBusy(true);
    setFeedback(null);
    const { error } = await supabase.functions.invoke('cancel-signup', {
      body: { signup_id: signup.id },
    });
    if (error) {
      const msg = await readErrorMessage(error);
      setFeedback({ type: 'err', msg });
      setBusy(false);
      return;
    }
    cancelEventReminder(id ?? '').catch(() => {});
    setFeedback({ type: 'ok', msg: 'Sign-up cancelled' });
    await load();
    setBusy(false);
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: palette.background }]}
        edges={['top']}
      >
        <LoadingCenter fill />
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: palette.background }]}
        edges={['top']}
      >
        <Header onBack={() => router.back()} backTestID="event-back" />
        <ErrorCard title="Event not found" />
      </SafeAreaView>
    );
  }

  const leaderName = event.leader?.display_name ?? event.leader?.full_name ?? '—';
  const assistantName = event.assistant?.display_name ?? event.assistant?.full_name ?? '—';
  const levelEmoji = LEVEL_EMOJI[event.min_level as ProgressionLevel] ?? '🦆';
  const minLevelLabel = LEVEL_LABEL[event.min_level as ProgressionLevel] ?? event.min_level;
  // Concession pricing: when the event carries tiers, the member picks one and
  // the sign-up call sends the index (never an amount). Index 0 is the
  // standard rate; a member who never touches the picker pays that.
  const priceOptions = parsePriceOptions(event.price_options);
  const hasTiers = priceOptions.length > 0;
  const tierIndex = hasTiers ? Math.min(Math.max(priceOption, 0), priceOptions.length - 1) : 0;
  const isPaid = hasTiers ? priceOptions.some((o) => o.pence > 0) : Number(event.cost) > 0;
  // What the CTA / notes should quote: the selected tier, else the flat cost.
  const selectedMoney = hasTiers
    ? formatPence(priceOptions[tierIndex].pence)
    : formatMoney(event.cost);
  // Headline pill: a single price, or "from £X" when tiers differ.
  const cheapestPence = hasTiers ? Math.min(...priceOptions.map((o) => o.pence)) : 0;
  const dearestPence = hasTiers ? Math.max(...priceOptions.map((o) => o.pence)) : 0;
  const costPillLabel = !hasTiers
    ? formatMoney(event.cost)
    : cheapestPence === dearestPence
      ? formatPence(cheapestPence)
      : `from ${formatPence(cheapestPence)}`;
  const isLeader = !!session && session.user.id === event.leader_id;
  const isAssistant = !!session && session.user.id === event.assistant_id;
  // Paddling (and super) admins can manage any event, not just their own.
  // The assistant can edit the event, but NOT review sign-ups.
  const canEdit = isLeader || isAssistant || roleFlags(profile).paddlingAdmin;
  const canReview = isLeader || roleFlags(profile).paddlingAdmin;

  const isPending = signup?.status === 'pending_payment';
  const isLeaderApproved = isPending && event.approval_mode === 'manual_all';
  const isConfirmed = signup?.status === 'confirmed';
  // A withdrawn row is the member's own cancellation — the sign-up function
  // will reuse it, so treat it as if they had never signed up.
  const isWithdrawn = signup?.status === 'withdrawn';
  // A seat opened while they were waitlisted. Paid events don't promote
  // automatically, so signing up again is how the member claims it.
  const canClaim = signup?.status === 'waitlisted' && event.status === 'open';

  const statusInfo = signup
    ? isLeaderApproved
      ? {
          label: `✅ Approved — pay ${selectedMoney} to confirm`,
          color: palette.success,
        }
      : SIGNUP_STATUS[signup.status as SignupStatus]
    : null;

  const canSignUp =
    (!signup || isPending || isWithdrawn || canClaim) &&
    !busy &&
    (event.status === 'open' || event.status === 'full');

  let primaryLabel = 'Sign up';
  if (event.status === 'full') {
    primaryLabel = 'Join waitlist';
  }
  if (event.status === 'cancelled') {
    primaryLabel = 'Cancelled';
  }
  if (event.status === 'closed') {
    primaryLabel = 'Closed';
  }
  if (event.status === 'draft') {
    primaryLabel = 'Not yet open';
  }
  const showFooterCta =
    !isLeader && !isAssistant && (!signup || isPending || isWithdrawn || canClaim);

  // Below the minimum level the member can still ask the leader, but only
  // once they've told us their paddling experience — that's what the leader
  // decides on. A leader-approved seat (pending payment) is past this.
  const belowLevel =
    !!profile &&
    showFooterCta &&
    !isPending &&
    !canClaim &&
    LEVEL_RANK[profile.level] < (LEVEL_RANK[event.min_level as ProgressionLevel] ?? 0);
  const hasExperience = hasAnyAnswer(profile?.experience_answers);
  const experienceHref = `/profile?editExperience=1&returnTo=${encodeURIComponent(`/event/${id}`)}`;
  if (belowLevel && (event.status === 'open' || event.status === 'full')) {
    primaryLabel = hasExperience ? 'Ask the leader' : 'Tell us your experience first';
  }

  if (canClaim) {
    primaryLabel = 'Claim your seat';
  }
  if (isPending) {
    primaryLabel = isLeaderApproved ? `Pay ${selectedMoney} to confirm` : `Pay ${selectedMoney}`;
  }

  // Credibility nudge: a serious grade (Sea B+, river G3+) is the moment to
  // invite an experienced joiner to establish their credentials. It's aimed at
  // people proving themselves, not beginners — so it only shows on those grades
  // and stops once a coach has reviewed them. Dolphins and Selkies were placed
  // there by an admin, so the club already vouches for them.
  const needsCredibility =
    !!profile &&
    LEVEL_RANK[profile.level] < LEVEL_RANK.dolphin &&
    !isLeader &&
    !isAssistant &&
    !isConfirmed &&
    !belowLevel &&
    !profile.experience_reviewed_at &&
    isCredibilityGrade(event.grade_advertised);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
      {/* The trip name is what a shared or bookmarked link should be called. */}
      <PageTitle title={event.title} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: showFooterCta ? 24 : 32 }}
      >
        <Header
          onBack={() => router.back()}
          backTestID="event-back"
          right={
            canEdit || canReview ? (
              <Row style={{ gap: 6 }}>
                {canReview ? (
                  <Pressable
                    accessibilityRole="button"
                    testID="event-review-cta"
                    onPress={() => router.push(`/event/${id}/review`)}
                    style={[
                      styles.headerAction,
                      pendingReviewCount > 0 ? { backgroundColor: OtterPalette.burntOrange } : null,
                    ]}
                  >
                    <Text style={styles.headerActionText}>
                      {pendingReviewCount > 0
                        ? `Review sign-ups · ${pendingReviewCount}`
                        : 'Review sign-ups'}
                    </Text>
                  </Pressable>
                ) : null}
                {canEdit ? (
                  <Pressable
                    accessibilityRole="button"
                    testID="event-edit-cta"
                    onPress={() => router.push(`/event/${id}/edit`)}
                    style={styles.headerAction}
                  >
                    <Text style={styles.headerActionText}>Edit</Text>
                  </Pressable>
                ) : null}
              </Row>
            ) : null
          }
        />

        {/* ---------- Just-published confirmation ---------- */}
        {created === '1' && canEdit ? (
          <Card style={{ borderColor: OtterPalette.forest, borderWidth: 1.5 }}>
            <Text style={[styles.value, { color: palette.success }]}>✓ Published</Text>
            <Text style={[styles.muted, { color: palette.muted, marginTop: 4 }]}>
              This is exactly what members see. You can change anything.
            </Text>
            <Pressable
              accessibilityRole="button"
              testID="event-published-edit"
              onPress={() => router.push(`/event/${id}/edit`)}
              style={{
                marginTop: 10,
                backgroundColor: OtterPalette.slateNavy,
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Edit event</Text>
            </Pressable>
          </Card>
        ) : null}

        {/* ---------- Hero with title overlay ---------- */}
        <View style={styles.hero}>
          <EventPhoto
            path={event.photo_path}
            height={220}
            color={categoryChip(event.category?.name ?? '').color}
            style={styles.heroPhoto}
          />
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
        <View style={styles.pillsWrap}>
          <Row style={{ flexWrap: 'wrap', gap: 8 }}>
            {event.grade_advertised ? (
              <Pill
                label={event.grade_advertised}
                color={OtterPalette.slateNavy}
                style={styles.infoPill}
                textStyle={styles.infoPillText}
              />
            ) : null}
            <Pill
              label={isPaid ? costPillLabel : 'Free'}
              color={isPaid ? OtterPalette.burntOrange : OtterPalette.forest}
              style={styles.infoPill}
              textStyle={styles.infoPillText}
            />
          </Row>
          {/* Approval mode is a leader setting — members don't need to see it.
              A caption rather than a pill, so it doesn't read as a button. */}
          {canEdit ? (
            <Text style={[styles.approvalNote, { color: palette.muted }]}>
              {event.approval_mode === 'manual_all'
                ? 'Sign-ups need your review'
                : 'Sign-ups are approved automatically'}
            </Text>
          ) : null}
        </View>

        {/* ---------- Minimum level, opens the Levels guide ---------- */}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${minLevelLabel} and above — about paddling levels`}
          onPress={() => router.push('/levels')}
          testID="event-level-pill"
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Card style={styles.levelRow}>
            <Text style={styles.levelEmoji}>{levelEmoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.levelName, { color: palette.text }]}>
                {`${minLevelLabel} and above`}
              </Text>
              <Text style={[styles.levelSub, { color: palette.muted }]}>
                {`Level ${LEVEL_RANK[event.min_level as ProgressionLevel] ?? '?'} minimum · what the levels mean`}
              </Text>
            </View>
            <Text style={[styles.levelChevron, { color: palette.muted }]}>›</Text>
          </Card>
        </Pressable>

        {/* ---------- Below the minimum level → ask the leader ---------- */}
        {belowLevel && profile ? (
          <Card
            testID="event-below-level"
            style={{ borderColor: OtterPalette.burntOrange, borderWidth: 1.5 }}
          >
            <Text style={[styles.value, { color: OtterPalette.burntOrange }]}>
              You're below the level for this trip
            </Text>
            <Text style={[styles.body, { color: palette.text, marginTop: 6 }]}>
              {hasExperience
                ? `You're ${LEVEL_LABEL[profile.level]}, but you can still ask. The leader will see your paddling experience and decide.`
                : `You're ${LEVEL_LABEL[profile.level]}. To ask the leader, first tell us your paddling experience. They'll read it and decide.`}
            </Text>
            <Pressable
              accessibilityRole="button"
              testID="event-below-level-experience"
              onPress={() => router.push(experienceHref as never)}
              style={{ marginTop: 10, alignSelf: 'flex-start' }}
            >
              <Text style={[styles.linkText, { color: palette.link }]}>
                {hasExperience ? 'Check or update your experience' : 'Tell us your experience'}
              </Text>
            </Pressable>
          </Card>
        ) : null}

        {/* ---------- Serious grade → invite an experienced joiner to vouch ---------- */}
        {needsCredibility ? (
          <Card style={{ borderColor: OtterPalette.burntOrange, borderWidth: 1.5 }}>
            <Text style={[styles.value, { color: OtterPalette.burntOrange }]}>
              {`Grade ${event.grade_advertised} — for experienced paddlers`}
            </Text>
            <Text style={[styles.muted, { color: palette.muted, marginTop: 6 }]}>
              {profile?.experience_review_requested
                ? 'Your paddling experience is with a coach for review — you can still ask to join, and the leader decides.'
                : 'New to OtterPool at this grade? Tell us your paddling experience so a coach can vouch for your level before you paddle it.'}
            </Text>
            {profile?.experience_review_requested ? null : (
              <Pressable
                accessibilityRole="button"
                testID="event-experience-cta"
                onPress={() => router.push('/profile')}
                style={{
                  marginTop: 10,
                  backgroundColor: OtterPalette.slateNavy,
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Tell us your experience</Text>
              </Pressable>
            )}
          </Card>
        ) : null}

        {/* ---------- You're in → join the trip WhatsApp ---------- */}
        {isConfirmed && chatUrl ? (
          <Card
            testID="event-whatsapp-card"
            style={{
              backgroundColor: scheme === 'dark' ? '#16302a' : '#e3f4ea',
              borderColor: 'transparent',
            }}
          >
            <Text style={[styles.whatsappTitle, { color: palette.success }]}>You're in!</Text>
            <Text style={[styles.body, { color: palette.text, marginTop: 6 }]}>
              Say hi to the crew. Lift-shares, kit swaps and any change of plan happen in the trip
              WhatsApp.
            </Text>
            <WhatsAppButton url={chatUrl} testID="event-whatsapp" style={{ marginTop: 12 }} />
            <Text
              style={[styles.muted, { color: palette.muted, marginTop: 8, textAlign: 'center' }]}
            >
              {`${participants.length} ${participants.length === 1 ? 'paddler' : 'paddlers'} confirmed so far`}
            </Text>
          </Card>
        ) : null}

        {/* ---------- When ---------- */}
        <SectionTitle>When</SectionTitle>
        <Card>
          <Text style={[styles.value, { color: palette.text }]}>
            {formatFullRange(event.starts_at, event.ends_at)}
          </Text>
          {isConfirmed && Platform.OS === 'web' ? (
            <Pressable
              accessibilityRole="button"
              testID="event-add-to-calendar"
              onPress={() => downloadIcs(event)}
              style={{ marginTop: 8, alignSelf: 'flex-start' }}
            >
              <Text style={[styles.linkText, { color: palette.link }]}>+ Add to your calendar</Text>
            </Pressable>
          ) : null}
        </Card>

        {/* ---------- Where ---------- */}
        {event.location || event.meeting_point || event.put_in_point ? (
          <>
            <SectionTitle>Where</SectionTitle>
            <Card>
              {event.location ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openMaps(event.location ?? '')}
                  testID="event-location"
                >
                  <Text style={[styles.value, styles.linkText, { color: palette.link }]}>
                    {event.location}
                  </Text>
                </Pressable>
              ) : null}
              {event.meeting_point ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    openMaps(`${event.meeting_point}${event.location ? `, ${event.location}` : ''}`)
                  }
                  testID="event-meeting-point"
                  style={{ marginTop: event.location ? 6 : 0 }}
                >
                  <Text style={[styles.muted, styles.linkText, { color: palette.link }]}>
                    Collect gear at {event.meeting_point}
                    {event.meeting_time ? ` · ${event.meeting_time.slice(0, 5)}` : ''} ↗
                  </Text>
                </Pressable>
              ) : null}
              {event.put_in_point ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    openMaps(`${event.put_in_point}${event.location ? `, ${event.location}` : ''}`)
                  }
                  testID="event-put-in-point"
                  style={{ marginTop: event.location || event.meeting_point ? 6 : 0 }}
                >
                  <Text style={[styles.muted, styles.linkText, { color: palette.link }]}>
                    Put in at {event.put_in_point}
                    {event.put_in_time ? ` · ${event.put_in_time.slice(0, 5)}` : ''} ↗
                  </Text>
                </Pressable>
              ) : null}
            </Card>
          </>
        ) : null}

        {/* ---------- Trip WhatsApp (editors who aren't going) ---------- */}
        {chatUrl && !isConfirmed ? (
          <>
            <SectionTitle>Trip WhatsApp</SectionTitle>
            <Card>
              <Pressable
                accessibilityRole="link"
                testID="event-whatsapp"
                onPress={() => Linking.openURL(chatUrl).catch(() => {})}
              >
                <Text style={[styles.value, styles.linkText, { color: palette.link }]}>
                  Join the trip WhatsApp ↗
                </Text>
              </Pressable>
            </Card>
          </>
        ) : null}

        {/* ---------- Description ---------- */}
        {event.description ? (
          <>
            <SectionTitle>Description</SectionTitle>
            <Card>
              <Text style={[styles.description, { color: palette.text }]}>{event.description}</Text>
            </Card>
          </>
        ) : null}

        {/* ---------- Leader(s) — leader and assistant share one row ---------- */}
        <SectionTitle>{event.assistant_id ? 'Leaders' : 'Leader'}</SectionTitle>
        <View style={styles.leaderRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/profile/${event.leader_id}`)}
            style={styles.leaderCell}
          >
            <Card style={styles.leaderCard}>
              <Row style={{ gap: 10 }}>
                <Avatar
                  path={event.leader?.avatar_path ?? null}
                  size={40}
                  fallback={
                    event.leader?.level
                      ? LEVEL_EMOJI[event.leader.level as ProgressionLevel]
                      : undefined
                  }
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.value, { color: palette.text }]} numberOfLines={1}>
                    {leaderName}
                  </Text>
                  {event.leader?.level ? (
                    <Text style={[styles.muted, { color: palette.muted }]} numberOfLines={1}>
                      {LEVEL_EMOJI[event.leader.level as ProgressionLevel] ?? ''}{' '}
                      {event.leader.level}
                    </Text>
                  ) : null}
                </View>
              </Row>
            </Card>
          </Pressable>
          {event.assistant_id ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/profile/${event.assistant_id}`)}
              style={styles.leaderCell}
            >
              <Card style={styles.leaderCard}>
                <Row style={{ gap: 10 }}>
                  <Avatar
                    path={event.assistant?.avatar_path ?? null}
                    size={40}
                    fallback={
                      event.assistant?.level
                        ? LEVEL_EMOJI[event.assistant.level as ProgressionLevel]
                        : undefined
                    }
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.value, { color: palette.text }]} numberOfLines={1}>
                      {assistantName}
                    </Text>
                    <Text style={[styles.muted, { color: palette.muted }]} numberOfLines={1}>
                      Assistant
                      {event.assistant?.level
                        ? ` · ${LEVEL_EMOJI[event.assistant.level as ProgressionLevel] ?? ''} ${event.assistant.level}`
                        : ''}
                    </Text>
                  </View>
                </Row>
              </Card>
            </Pressable>
          ) : (
            // Keeps a lone leader at half width, so the card doesn't stretch.
            <View style={styles.leaderCell} />
          )}
        </View>

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
            const emoji = LEVEL_EMOJI[p.level as ProgressionLevel] ?? '🦦';
            return (
              <Pressable
                accessibilityRole="button"
                key={p.member_id}
                onPress={() => router.push(`/profile/${p.member_id}`)}
              >
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

        {/* ---------- What to bring ---------- */}
        {event.what_to_bring ? (
          <>
            <SectionTitle>What to bring</SectionTitle>
            <Card>
              {parseKitList(event.what_to_bring).map((sec, si) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: sections of static text
                <View key={si} style={{ marginTop: si === 0 ? 0 : 16 }}>
                  {sec.heading ? (
                    <Text style={[styles.value, { color: palette.link, marginBottom: 4 }]}>
                      {sec.heading}
                    </Text>
                  ) : null}
                  {sec.items.map((item, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: lines of static text
                    <Row key={i} style={styles.kitItem}>
                      <View style={[styles.kitBox, { borderColor: palette.muted }]} />
                      <Text style={[styles.body, { color: palette.text, flex: 1 }]}>{item}</Text>
                    </Row>
                  ))}
                  {sec.notes.map((note, i) => (
                    <Text
                      // biome-ignore lint/suspicious/noArrayIndexKey: lines of static text
                      key={i}
                      style={[styles.muted, styles.kitNote, { color: palette.muted }]}
                    >
                      {note}
                    </Text>
                  ))}
                </View>
              ))}
              <Pressable
                accessibilityRole="button"
                testID="event-kit-checklist"
                onPress={() =>
                  openKitChecklist(
                    event.title,
                    formatFullRange(event.starts_at, event.ends_at),
                    event.what_to_bring ?? '',
                  ).catch((e) => console.warn('[kit] checklist failed:', e))
                }
                style={{ marginTop: 16, alignSelf: 'flex-start' }}
              >
                <Text style={[styles.linkText, { color: palette.link }]}>
                  ⬇ Download checklist (print or save as PDF)
                </Text>
              </Pressable>
            </Card>
          </>
        ) : null}

        {/* ---------- Choose your rate (concession tiers) ---------- */}
        {hasTiers && canSignUp ? (
          <>
            <SectionTitle>Choose your rate</SectionTitle>
            <Card>
              <Text style={[styles.muted, { color: palette.muted, marginBottom: 10 }]}>
                Pick the rate that applies to you — we trust you to choose fairly.
              </Text>
              {priceOptions.map((opt, i) => {
                const active = i === tierIndex;
                return (
                  <Pressable
                    accessibilityState={{ selected: active }}
                    accessibilityRole="button"
                    // biome-ignore lint/suspicious/noArrayIndexKey: tiers are fixed for the event, label + index is unique
                    key={`${opt.label}-${i}`}
                    testID={`price-tier-${i}`}
                    onPress={() => setPriceOption(i)}
                    style={[
                      styles.tierRow,
                      {
                        borderColor: active ? OtterPalette.slateNavy : palette.border,
                        backgroundColor: active ? `${OtterPalette.slateNavy}12` : palette.surface,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.tierRadio,
                        { borderColor: active ? OtterPalette.slateNavy : palette.muted },
                      ]}
                    >
                      {active ? <View style={styles.tierRadioDot} /> : null}
                    </View>
                    <Text style={[styles.tierLabel, { color: palette.text }]}>{opt.label}</Text>
                    <Text style={[styles.tierPrice, { color: palette.link }]}>
                      {formatPence(opt.pence)}
                    </Text>
                  </Pressable>
                );
              })}
            </Card>
          </>
        ) : null}

        {/* ---------- Your status ---------- */}
        {signup && statusInfo ? (
          <>
            <SectionTitle>Your status</SectionTitle>
            <Card style={{ borderColor: statusInfo.color, borderWidth: 1.5 }}>
              <Text style={[styles.value, { color: statusInfo.color }]}>{statusInfo.label}</Text>
              <Text style={[styles.muted, { color: palette.muted, marginTop: 4 }]}>
                Signed up {formatDateTime(new Date(signup.signed_up_at))}
              </Text>
              {isPaid && signup.status === 'confirmed' ? (
                <Text style={[styles.muted, { color: palette.muted, marginTop: 6 }]}>
                  Payment received ·{' '}
                  {signup.amount_paid_pence != null
                    ? formatPence(signup.amount_paid_pence)
                    : selectedMoney}
                </Text>
              ) : null}
              {signup.status === 'pending_payment' ? (
                <Text style={[styles.muted, { color: palette.muted, marginTop: 6 }]}>
                  {isLeaderApproved
                    ? `The leader has approved your sign-up. Pay ${selectedMoney} below to lock in your spot.`
                    : 'Tap "Sign up" again to resume payment if the sheet was dismissed.'}
                </Text>
              ) : null}
              {signup.status !== 'withdrawn' && signup.status !== 'declined' ? (
                <Pressable
                  accessibilityRole="button"
                  testID="event-cancel-signup"
                  onPress={handleCancelSignup}
                  disabled={busy}
                  style={[styles.cancelBtn, { borderColor: palette.border }]}
                >
                  <Text style={[styles.cancelBtnText, { color: OtterPalette.ice }]}>
                    {isPaid && signup.status === 'confirmed'
                      ? 'Cancel sign-up (contact leader for refund)'
                      : 'Cancel sign-up'}
                  </Text>
                </Pressable>
              ) : null}
            </Card>
          </>
        ) : null}

        {feedback ? (
          <Card
            style={{
              borderWidth: 1.5,
              borderColor: feedback.type === 'ok' ? OtterPalette.forest : OtterPalette.ice,
            }}
          >
            <Text
              accessibilityRole="alert"
              style={[
                styles.body,
                { color: feedback.type === 'ok' ? OtterPalette.forest : OtterPalette.ice },
              ]}
            >
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
            {
              backgroundColor: palette.background,
              borderTopColor: palette.border,
              paddingBottom: (Platform.OS === 'ios' ? 20 : 16) + insets.bottom,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            testID="event-primary-cta"
            onPress={
              !canSignUp
                ? undefined
                : belowLevel && !hasExperience
                  ? () => router.push(experienceHref as never)
                  : handleSignUp
            }
            disabled={!canSignUp}
            style={[
              styles.primaryBtn,
              {
                backgroundColor: canSignUp ? OtterPalette.slateNavy : '#9aa3ac',
                opacity: busy ? 0.7 : 1,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
            )}
          </Pressable>
          {isPaid && !isPending ? (
            <Text style={[styles.payNote, { color: palette.muted }]}>
              {event.approval_mode === 'manual_all' || belowLevel
                ? `${selectedMoney} taken after the leader confirms your spot.`
                : `Card payment of ${selectedMoney} taken on sign-up.`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerAction: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  headerActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
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
      ? ({
          backgroundImage:
            'linear-gradient(to bottom, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.65) 100%)',
          backgroundColor: 'transparent',
          // biome-ignore lint/suspicious/noExplicitAny: backgroundImage is web-only CSS that RN's style types don't know
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
  description: { fontSize: 17, lineHeight: 25 },
  pillsWrap: { paddingHorizontal: 16, marginTop: 18, marginBottom: 8 },
  infoPill: { paddingHorizontal: 14, paddingVertical: 8 },
  infoPillText: { fontSize: 14 },
  approvalNote: { fontSize: 13, marginTop: 10 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  levelEmoji: { fontSize: 24 },
  levelName: { fontSize: 15, fontWeight: '700' },
  levelSub: { fontSize: 12, marginTop: 2 },
  levelChevron: { fontSize: 22 },
  kitItem: { alignItems: 'flex-start', gap: 10, paddingVertical: 3 },
  kitBox: { width: 14, height: 14, borderWidth: 1.5, borderRadius: 3, marginTop: 3 },
  kitNote: { fontStyle: 'italic', marginTop: 6 },
  leaderRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
  },
  leaderCell: { flex: 1 },
  leaderCard: { marginHorizontal: 0, flex: 1 },
  linkText: {
    textDecorationLine: 'underline',
  },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  whatsappTitle: { fontSize: 20, fontWeight: '800' },
  payNote: { fontSize: 11, textAlign: 'center', marginTop: 10 },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  tierRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: OtterPalette.slateNavy,
  },
  tierLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  tierPrice: { fontSize: 16, fontWeight: '700' },
  cancelBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 13, fontWeight: '600' },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
    borderTopWidth: 1,
  },
});
