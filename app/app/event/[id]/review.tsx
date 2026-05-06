import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Pill, Row, SectionTitle } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type EventRow = {
  id: string;
  title: string;
  cost: number;
  leader_id: string;
  approval_mode: string;
};

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
    status: string;
  } | null;
};

const LEVEL_EMOJI: Record<string, string> = {
  frog: '🐸',
  duck: '🦆',
  otter: '🦦',
  dolphin: '🐬',
  selkie: '🦭',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
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

export default function ReviewSignupsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const palette = Colors[useColorScheme() ?? 'light'];
  const { session } = useAuth();

  const [event, setEvent] = useState<EventRow | null>(null);
  const [signups, setSignups] = useState<PendingSignup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [eventRes, signupRes] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, cost, leader_id, approval_mode')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('event_signups')
        .select(
          'id, status, signed_up_at, notes, member_id, member:profiles!event_signups_member_id_fkey(id, display_name, full_name, level, status)',
        )
        .eq('event_id', id)
        .eq('status', 'pending_review')
        .order('signed_up_at', { ascending: true }),
    ]);

    if (!eventRes.error) setEvent((eventRes.data as EventRow) ?? null);
    if (!signupRes.error) setSignups((signupRes.data as unknown as PendingSignup[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

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

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
        <Header onBack={() => router.back()} />
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

  if (!session || session.user.id !== event.leader_id) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
        <Header onBack={() => router.back()} />
        <Card>
          <Text style={[styles.errTitle, { color: OtterPalette.ice }]}>
            Only the event leader can review sign-ups.
          </Text>
        </Card>
      </SafeAreaView>
    );
  }

  const isPaid = Number(event.cost) > 0;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Header onBack={() => router.back()} />

        <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
          <Text style={[styles.title, { color: palette.text }]}>Review sign-ups</Text>
          <Text style={[styles.subtitle, { color: palette.muted }]}>{event.title}</Text>
          {isPaid ? (
            <Text style={[styles.note, { color: palette.muted, marginTop: 8 }]}>
              Confirming a member will prompt them for £{Number(event.cost).toFixed(0)}{' '}
              payment to complete sign-up.
            </Text>
          ) : null}
        </View>

        {feedback ? (
          <Card
            style={{
              borderWidth: 1.5,
              borderColor: feedback.type === 'ok' ? OtterPalette.forest : OtterPalette.ice,
              marginTop: 16,
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

        <SectionTitle>Pending</SectionTitle>

        {(signups ?? []).length === 0 ? (
          <Card>
            <Text style={[styles.empty, { color: palette.muted }]}>
              No one is waiting for review.
            </Text>
          </Card>
        ) : (
          (signups ?? []).map((s) => {
            const name =
              s.member?.display_name ?? s.member?.full_name ?? 'Unknown member';
            const levelEmoji = s.member?.level ? LEVEL_EMOJI[s.member.level] ?? '' : '';
            const busy = busyId === s.id;
            return (
              <Card key={s.id}>
                <Pressable
                  onPress={() => router.push(`/profile/${s.member_id}`)}
                  style={{ marginBottom: 10 }}>
                  <Text style={[styles.memberName, { color: palette.text }]}>{name}</Text>
                  <Text style={[styles.muted, { color: palette.muted, marginTop: 2 }]}>
                    Signed up {formatDateTime(s.signed_up_at)} · tap to view profile
                  </Text>
                </Pressable>

                <Row style={{ flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {s.member?.level ? (
                    <Pill
                      label={`${levelEmoji} ${s.member.level}`}
                      color="#e3e1dc"
                      textStyle={{ color: '#2a2f33' }}
                    />
                  ) : null}
                  {s.member?.status ? (
                    <Pill
                      label={s.member.status}
                      color={
                        s.member.status === 'active'
                          ? OtterPalette.forest
                          : OtterPalette.lochPool
                      }
                    />
                  ) : null}
                </Row>

                {s.notes ? (
                  <Text style={[styles.body, { color: palette.text, marginBottom: 10 }]}>
                    "{s.notes}"
                  </Text>
                ) : null}

                <Row style={{ gap: 10 }}>
                  <Pressable
                    testID={`review-confirm-${s.id}`}
                    onPress={busy ? undefined : () => review(s.id, 'confirm')}
                    disabled={busy}
                    style={[
                      styles.btn,
                      { backgroundColor: OtterPalette.forest, opacity: busy ? 0.6 : 1 },
                    ]}>
                    {busy ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.btnText}>Confirm</Text>
                    )}
                  </Pressable>
                  <Pressable
                    testID={`review-deny-${s.id}`}
                    onPress={busy ? undefined : () => review(s.id, 'deny')}
                    disabled={busy}
                    style={[
                      styles.btn,
                      styles.btnSecondary,
                      { borderColor: OtterPalette.ice, opacity: busy ? 0.6 : 1 },
                    ]}>
                    <Text style={[styles.btnText, { color: OtterPalette.ice }]}>Deny</Text>
                  </Pressable>
                </Row>
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={[styles.header, { backgroundColor: OtterPalette.slateNavy }]}>
      <Pressable onPress={onBack} style={styles.backBtn}>
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
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 4 },
  note: { fontSize: 12 },
  memberName: { fontSize: 15, fontWeight: '700' },
  muted: { fontSize: 12 },
  body: { fontSize: 14, lineHeight: 20 },
  errTitle: { fontSize: 14, fontWeight: '700' },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },
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
