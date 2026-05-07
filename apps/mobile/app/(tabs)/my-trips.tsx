import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, GreyBox, Pill, Row, SectionTitle, TopBar } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type SignupRow = {
  id: string;
  status: string;
  event: {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string | null;
    grade_advertised: string | null;
    grade_actual: string | null;
    category: { name: string } | null;
  } | null;
};

type TallyRow = { bucket: string; count: number };

const STATUS_PILL: Record<string, { label: string; color: string }> = {
  confirmed: { label: 'Confirmed', color: OtterPalette.forest },
  pending_payment: { label: 'Awaiting payment', color: OtterPalette.burntOrange },
  pending_review: { label: 'Pending review', color: OtterPalette.burntOrange },
  waitlisted: { label: 'Waitlist', color: OtterPalette.lochPool },
};

function bucketFor(
  categoryName: string | null | undefined,
  gradeAdvertised: string | null,
  gradeActual: string | null,
): string {
  const name = categoryName ?? '';
  if (name === 'Sea Kayak - A Trip') return 'Sea A';
  if (name === 'Sea Kayak - B Trip') return 'Sea B';
  if (name === 'Sea Kayak - C Trip') return 'Sea C';
  if (name === 'River Trip') return gradeActual ?? gradeAdvertised ?? 'River';
  if (name === 'Pinkston - 1 Pump') return 'P1';
  if (name === 'Pinkston - 2 Pumps') return 'P2';
  if (name === 'Pinkston - 3 Pumps') return 'P3';
  if (name.startsWith('Tuesday Evening')) return 'Tuesday';
  if (name === 'Pool / Loch Sessions') return 'Loch';
  if (name === 'Night Paddle') return 'Night';
  if (name === 'Second Saturday Paddle') return '2nd Sat';
  if (name.startsWith('Skills')) return 'Skills';
  if (name.startsWith('Training')) return 'Training';
  return name || '—';
}

function colorForBucket(bucket: string): string {
  if (bucket === 'Sea A') return OtterPalette.seaTeal[0];
  if (bucket === 'Sea B') return OtterPalette.seaTeal[1];
  if (bucket === 'Sea C') return OtterPalette.seaTeal[2];
  if (bucket === 'P1') return OtterPalette.pinkstonOrange[0];
  if (bucket === 'P2') return OtterPalette.pinkstonOrange[1];
  if (bucket === 'P3') return OtterPalette.pinkstonOrange[2];
  if (bucket.startsWith('G')) return OtterPalette.riverGreen[1];
  if (bucket === 'Skills' || bucket === 'Training') return OtterPalette.slateNavy;
  return OtterPalette.lochPool;
}

function formatUpcoming(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

function formatPast(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function MyTripsScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const { session } = useAuth();

  const [upcoming, setUpcoming] = useState<SignupRow[] | null>(null);
  const [past, setPast] = useState<SignupRow[] | null>(null);
  const [tally, setTally] = useState<TallyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) {
      setUpcoming([]);
      setPast([]);
      setTally([]);
      return;
    }
    setError(null);

    const [signupsRes, tallyRes] = await Promise.all([
      supabase
        .from('event_signups')
        .select(
          'id, status, event:events!inner(id, title, starts_at, ends_at, grade_advertised, grade_actual, category:event_categories(name))',
        )
        .eq('member_id', session.user.id)
        .not('status', 'in', '(withdrawn,declined)'),
      supabase.from('my_trip_tally').select('bucket, count'),
    ]);

    if (signupsRes.error) {
      setError(signupsRes.error.message);
      setUpcoming([]);
      setPast([]);
    } else {
      const rows = (signupsRes.data ?? []) as unknown as SignupRow[];
      const now = Date.now();
      const up: SignupRow[] = [];
      const pa: SignupRow[] = [];
      for (const r of rows) {
        if (!r.event) continue;
        const endIso = r.event.ends_at ?? r.event.starts_at;
        if (new Date(endIso).getTime() >= now) {
          up.push(r);
        } else if (r.status === 'confirmed') {
          pa.push(r);
        }
      }
      up.sort(
        (a, b) =>
          new Date(a.event!.starts_at).getTime() - new Date(b.event!.starts_at).getTime(),
      );
      pa.sort(
        (a, b) =>
          new Date(b.event!.starts_at).getTime() - new Date(a.event!.starts_at).getTime(),
      );
      setUpcoming(up);
      setPast(pa);
    }

    if (tallyRes.error) {
      setTally([]);
    } else {
      const t = ((tallyRes.data ?? []) as TallyRow[]).slice();
      t.sort((a, b) => b.count - a.count || a.bucket.localeCompare(b.bucket));
      setTally(t);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const isLoading = upcoming == null || past == null || tally == null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <TopBar title="My Trips" subtitle="Upcoming and past" />

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={palette.tint} />
          </View>
        ) : error ? (
          <Card>
            <Text style={[styles.errTitle, { color: OtterPalette.ice }]}>
              Couldn&apos;t load trips
            </Text>
            <Text style={[styles.muted, { color: palette.muted }]}>{error}</Text>
          </Card>
        ) : (
          <>
            <SectionTitle>Upcoming</SectionTitle>
            {upcoming.length === 0 ? (
              <Card>
                <Text style={[styles.empty, { color: palette.muted }]}>
                  Nothing booked. Browse the calendar to find a trip.
                </Text>
              </Card>
            ) : (
              upcoming.map((s) => {
                const ev = s.event!;
                const pill = STATUS_PILL[s.status];
                return (
                  <Pressable key={s.id} onPress={() => router.push(`/event/${ev.id}`)}>
                    <Card>
                      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={[styles.title, { color: palette.text }]}>{ev.title}</Text>
                          <Text style={[styles.date, { color: palette.muted }]}>
                            {formatUpcoming(ev.starts_at)}
                          </Text>
                        </View>
                        {pill ? <Pill label={pill.label} color={pill.color} /> : null}
                      </Row>
                    </Card>
                  </Pressable>
                );
              })
            )}

            {tally.length > 0 ? (
              <>
                <SectionTitle>Experience tally</SectionTitle>
                <Card>
                  <Row style={{ flexWrap: 'wrap', gap: 8 }}>
                    {tally.map((t) => (
                      <Pill
                        key={t.bucket}
                        label={`${t.bucket} · ${t.count}`}
                        color={colorForBucket(t.bucket)}
                      />
                    ))}
                  </Row>
                </Card>
              </>
            ) : null}

            <SectionTitle>Past trips</SectionTitle>
            {past.length === 0 ? (
              <Card>
                <Text style={[styles.empty, { color: palette.muted }]}>
                  No past trips yet.
                </Text>
              </Card>
            ) : (
              past.map((s) => {
                const ev = s.event!;
                const bucket = bucketFor(
                  ev.category?.name,
                  ev.grade_advertised,
                  ev.grade_actual,
                );
                return (
                  <Pressable key={s.id} onPress={() => router.push(`/event/${ev.id}`)}>
                    <Card>
                      <Row>
                        <GreyBox height={44} style={{ width: 44, borderRadius: 8 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.title, { color: palette.text }]}>{ev.title}</Text>
                          <Text style={[styles.date, { color: palette.muted }]}>
                            {formatPast(ev.starts_at)} · {bucket}
                          </Text>
                        </View>
                      </Row>
                    </Card>
                  </Pressable>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  date: { fontSize: 12 },
  muted: { fontSize: 12 },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  errTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  center: { padding: 32, alignItems: 'center' },
});
