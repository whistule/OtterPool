import { router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header } from '@/components/header';
import { PageTitle } from '@/components/page-title';
import { EmptyCard, ErrorCard, LoadingCenter } from '@/components/screen-states';
import { Card, Pill, Row, SectionTitle } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoadOnFocus } from '@/hooks/use-load-on-focus';
import { roleFlags, useAuth } from '@/lib/auth';
import { formatShortDateTime } from '@/lib/datetime';
import { readErrorMessage } from '@/lib/errors';
import { EXPERIENCE_QUESTIONS, type ExperienceAnswers, hasAnyAnswer } from '@/lib/experience';
import { LEVEL_EMOJI, LEVEL_LABEL, LEVEL_RANK, type ProgressionLevel } from '@/lib/progress';
import { SIGNUP_STATUS, type SignupStatus } from '@/lib/status';
import { supabase } from '@/lib/supabase';
import { formatMoney } from '@/lib/money';

type EventRow = {
  id: string;
  title: string;
  cost: number;
  leader_id: string;
  approval_mode: string;
  min_level: string;
};

type Experience = { answers: ExperienceAnswers | null; reviewedAt: string | null };

type PendingSignup = {
  id: string;
  status: string;
  signed_up_at: string;
  notes: string | null;
  member_id: string;
  member: {
    id: string;
    display_name: string | null;
    full_name: string | null;
    level: string;
  } | null;
};

export default function ReviewSignupsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const palette = Colors[useColorScheme() ?? 'light'];
  const { session, profile } = useAuth();

  const [event, setEvent] = useState<EventRow | null>(null);
  const [signups, setSignups] = useState<PendingSignup[] | null>(null);
  // Paddling experience by member id — only for people awaiting review here.
  const [experience, setExperience] = useState<Record<string, Experience>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      return;
    }
    const [eventRes, signupRes, expRes] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, cost, leader_id, approval_mode, min_level')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('event_signups')
        .select(
          'id, status, signed_up_at, notes, member_id, member:profiles!event_signups_member_id_fkey(id, display_name, full_name, level)',
        )
        .eq('event_id', id)
        .in('status', ['pending_review', 'confirmed', 'pending_payment', 'waitlisted'])
        .order('signed_up_at', { ascending: true }),
      supabase.rpc('event_signup_experience', { p_event_id: id }),
    ]);

    if (!expRes.error) {
      const byMember: Record<string, Experience> = {};
      for (const row of (expRes.data ?? []) as {
        member_id: string;
        experience_answers: ExperienceAnswers | null;
        experience_reviewed_at: string | null;
      }[]) {
        byMember[row.member_id] = {
          answers: row.experience_answers,
          reviewedAt: row.experience_reviewed_at,
        };
      }
      setExperience(byMember);
    }

    if (!eventRes.error) {
      setEvent((eventRes.data as EventRow) ?? null);
    }
    if (!signupRes.error) {
      setSignups((signupRes.data as unknown as PendingSignup[]) ?? []);
    }
    setLoading(false);
  }, [id]);

  useLoadOnFocus(load);

  const review = async (signupId: string, action: 'confirm' | 'deny') => {
    setBusyId(signupId);
    setFeedback(null);
    const { data, error } = await supabase.functions.invoke<{
      signup_id: string;
      status: string;
      message?: string;
    }>('review-signup', {
      body: { signup_id: signupId, action },
    });
    if (error) {
      const msg = await readErrorMessage(error);
      setFeedback({ type: 'err', msg });
      setBusyId(null);
      return;
    }
    setFeedback({
      type: 'ok',
      msg:
        data?.message ??
        (action === 'confirm'
          ? data?.status === 'pending_payment'
            ? 'Confirmed — member will be prompted to pay'
            : 'Confirmed'
          : 'Declined'),
    });
    await load();
    setBusyId(null);
  };

  // Taking someone off a paid, confirmed place needs a manual refund, so
  // confirm first.
  const confirmRemove = (name: string) => {
    const title = `Remove ${name}?`;
    const body = 'They lose their place but can sign up again. Any payment is refunded manually.';
    return new Promise<boolean>((resolve) => {
      if (Platform.OS === 'web') {
        resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${body}`) : false);
        return;
      }
      Alert.alert(title, body, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  };

  const remove = async (s: PendingSignup) => {
    const name = s.member?.display_name ?? s.member?.full_name ?? 'this member';
    if (!(await confirmRemove(name))) {
      return;
    }
    setBusyId(s.id);
    setFeedback(null);
    const { error } = await supabase.functions.invoke('cancel-signup', {
      body: { signup_id: s.id },
    });
    if (error) {
      const msg = await readErrorMessage(error);
      setFeedback({ type: 'err', msg });
      setBusyId(null);
      return;
    }
    setFeedback({ type: 'ok', msg: `Removed ${name}` });
    await load();
    setBusyId(null);
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: palette.background }]}
        edges={['top']}
      >
        <Header onBack={() => router.back()} />
        <LoadingCenter />
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: palette.background }]}
        edges={['top']}
      >
        <Header onBack={() => router.back()} />
        <ErrorCard title="Event not found" />
      </SafeAreaView>
    );
  }

  if (!session || (session.user.id !== event.leader_id && !roleFlags(profile).paddlingAdmin)) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: palette.background }]}
        edges={['top']}
      >
        <Header onBack={() => router.back()} />
        <ErrorCard title="Only the event leader can review sign-ups." />
      </SafeAreaView>
    );
  }

  const isPaid = Number(event.cost) > 0;

  const all = signups ?? [];
  const pending = all.filter((s) => s.status === 'pending_review');
  const attending = all.filter((s) => s.status === 'confirmed' || s.status === 'pending_payment');
  const waitlist = all.filter((s) => s.status === 'waitlisted');

  const memberRow = (s: PendingSignup, actions: ReactNode) => {
    const name = s.member?.display_name ?? s.member?.full_name ?? 'Unknown member';
    const levelEmoji = s.member?.level
      ? (LEVEL_EMOJI[s.member.level as ProgressionLevel] ?? '')
      : '';
    const statusInfo = SIGNUP_STATUS[s.status as SignupStatus];
    const belowLevel =
      !!s.member?.level &&
      (LEVEL_RANK[s.member.level as ProgressionLevel] ?? 0) <
        (LEVEL_RANK[event.min_level as ProgressionLevel] ?? 0);
    const exp = experience[s.member_id];
    return (
      <Card key={s.id}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/profile/${s.member_id}`)}
          style={{ marginBottom: 10 }}
        >
          <Text style={[styles.memberName, { color: palette.text }]}>{name}</Text>
          <Text style={[styles.muted, { color: palette.muted, marginTop: 2 }]}>
            Signed up {formatShortDateTime(s.signed_up_at)} · tap to view profile
          </Text>
        </Pressable>

        <Row style={{ flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {s.member?.level ? (
            <Pill
              label={`${levelEmoji} ${s.member.level}`}
              color={palette.placeholder}
              textStyle={{ color: palette.text }}
            />
          ) : null}
          {statusInfo ? <Pill label={statusInfo.shortLabel} color={statusInfo.color} /> : null}
          {belowLevel ? (
            <Pill
              testID={`review-below-level-${s.id}`}
              label={`Below minimum · trip is ${LEVEL_LABEL[event.min_level as ProgressionLevel] ?? event.min_level}+`}
              color={OtterPalette.burntOrange}
            />
          ) : null}
        </Row>

        {hasAnyAnswer(exp?.answers) ? (
          <View
            testID={`review-experience-${s.id}`}
            style={[styles.experience, { borderColor: palette.border }]}
          >
            <Text style={[styles.expHeading, { color: palette.text }]}>
              Their paddling experience
            </Text>
            <Text style={[styles.muted, { color: palette.muted, marginBottom: 8 }]}>
              {exp?.reviewedAt
                ? `A coach reviewed this on ${formatShortDateTime(exp.reviewedAt)}.`
                : 'Not yet reviewed by a coach — this is in their own words.'}
            </Text>
            {EXPERIENCE_QUESTIONS.filter(
              (q) => (exp?.answers?.[q.key] ?? '').trim().length > 0,
            ).map((q) => (
              <View key={q.key} style={{ marginBottom: 8 }}>
                <Text style={[styles.muted, { color: palette.muted }]}>{q.label}</Text>
                <Text style={[styles.body, { color: palette.text }]}>{exp?.answers?.[q.key]}</Text>
              </View>
            ))}
          </View>
        ) : belowLevel ? (
          <Text style={[styles.body, { color: palette.muted, marginBottom: 10 }]}>
            They haven't filled in their paddling experience.
          </Text>
        ) : null}

        {s.notes ? (
          <Text style={[styles.body, { color: palette.text, marginBottom: 10 }]}>"{s.notes}"</Text>
        ) : null}

        <Row style={{ gap: 10 }}>{actions}</Row>
      </Card>
    );
  };

  const removeButton = (s: PendingSignup, busy: boolean) => (
    <Pressable
      accessibilityRole="button"
      testID={`review-remove-${s.id}`}
      onPress={busy ? undefined : () => remove(s)}
      disabled={busy}
      style={[
        styles.btn,
        styles.btnSecondary,
        { borderColor: OtterPalette.ice, opacity: busy ? 0.6 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={OtterPalette.ice} size="small" />
      ) : (
        <Text style={[styles.btnText, { color: OtterPalette.ice }]}>Remove</Text>
      )}
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
      <PageTitle title="Review sign-ups" />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Header onBack={() => router.back()} />

        <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
          <Text style={[styles.title, { color: palette.text }]}>Review sign-ups</Text>
          <Text style={[styles.subtitle, { color: palette.muted }]}>{event.title}</Text>
          {isPaid ? (
            <Text style={[styles.note, { color: palette.muted, marginTop: 8 }]}>
              Confirming a member will prompt them for {formatMoney(event.cost)} payment to complete
              sign-up.
            </Text>
          ) : null}
        </View>

        {feedback ? (
          <Card
            style={{
              borderWidth: 1.5,
              borderColor: feedback.type === 'ok' ? OtterPalette.forest : OtterPalette.ice,
              marginTop: 16,
            }}
          >
            <Text
              style={[
                styles.body,
                { color: feedback.type === 'ok' ? OtterPalette.forest : OtterPalette.ice },
              ]}
            >
              {feedback.msg}
            </Text>
          </Card>
        ) : null}

        {pending.length === 0 ? <EmptyCard message="No one is waiting for review." /> : null}

        {pending.length > 0 ? (
          <>
            <SectionTitle>Pending review</SectionTitle>
            {pending.map((s) => {
              const busy = busyId === s.id;
              return memberRow(
                s,
                <>
                  <Pressable
                    accessibilityRole="button"
                    testID={`review-confirm-${s.id}`}
                    onPress={busy ? undefined : () => review(s.id, 'confirm')}
                    disabled={busy}
                    style={[
                      styles.btn,
                      { backgroundColor: OtterPalette.forest, opacity: busy ? 0.6 : 1 },
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.btnText}>Confirm</Text>
                    )}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    testID={`review-deny-${s.id}`}
                    onPress={busy ? undefined : () => review(s.id, 'deny')}
                    disabled={busy}
                    style={[
                      styles.btn,
                      styles.btnSecondary,
                      { borderColor: OtterPalette.ice, opacity: busy ? 0.6 : 1 },
                    ]}
                  >
                    <Text style={[styles.btnText, { color: OtterPalette.ice }]}>Deny</Text>
                  </Pressable>
                </>,
              );
            })}
          </>
        ) : null}

        {attending.length > 0 ? (
          <>
            <SectionTitle>Attending</SectionTitle>
            {attending.map((s) => memberRow(s, removeButton(s, busyId === s.id)))}
          </>
        ) : null}

        {waitlist.length > 0 ? (
          <>
            <SectionTitle>Waitlist</SectionTitle>
            {waitlist.map((s) => memberRow(s, removeButton(s, busyId === s.id)))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 4 },
  note: { fontSize: 12 },
  memberName: { fontSize: 15, fontWeight: '700' },
  muted: { fontSize: 12 },
  body: { fontSize: 14, lineHeight: 20 },
  experience: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  expHeading: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
