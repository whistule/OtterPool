import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Ceiling,
  CeilingsCard,
  CurrentLevelCard,
  GradeSection,
  JourneyLadder,
  StatRow,
} from '@/components/progress-blocks';
import { ErrorCard, LoadingCenter } from '@/components/screen-states';
import { Card, SectionTitle, TopBar } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoadOnFocus } from '@/hooks/use-load-on-focus';
import { useAuth } from '@/lib/auth';
import { ProgressionLevel, tallyTotals, Track } from '@/lib/progress';
import { supabase } from '@/lib/supabase';

type TallyRow = { bucket: string; count: number };
type ApprovalRow = { track: Track; ceiling: string };

export default function ProgressScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const { session, profile } = useAuth();

  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [tally, setTally] = useState<TallyRow[] | null>(null);
  const [ceilings, setCeilings] = useState<Ceiling[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setError(null);
    const [profRes, tallyRes, ceilRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('created_at')
        .eq('id', session.user.id)
        .maybeSingle(),
      supabase.from('my_trip_tally').select('bucket, count'),
      supabase
        .from('member_approvals')
        .select('track, ceiling')
        .eq('member_id', session.user.id),
    ]);
    if (profRes.error) setError(profRes.error.message);
    setCreatedAt((profRes.data as { created_at: string } | null)?.created_at ?? null);
    setTally(((tallyRes.data ?? []) as TallyRow[]) ?? []);
    setCeilings(((ceilRes.data ?? []) as ApprovalRow[]).map((r) => ({ ...r })));
  }, [session]);

  const { refreshing, onRefresh } = useLoadOnFocus(load);

  const level: ProgressionLevel = profile?.level ?? 'frog';
  const isAdmin = !!profile?.is_admin;
  const counts: Record<string, number> = {};
  for (const t of tally ?? []) counts[t.bucket] = t.count;
  const totals = tallyTotals(tally ?? []);

  const isLoading = tally == null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <TopBar title="Progress" subtitle="Your journey" />

        {isLoading ? (
          <LoadingCenter />
        ) : error ? (
          <ErrorCard title="Couldn't load progress" message={error} />
        ) : (
          <>
            {isAdmin ? (
              <Pressable
                onPress={() => router.push('/members')}
                testID="admin-manage-members">
                <Card style={styles.adminCard}>
                  <Text style={styles.adminKicker}>Admin</Text>
                  <Text style={styles.adminAction}>Manage members ›</Text>
                </Card>
              </Pressable>
            ) : null}

            <CurrentLevelCard level={level} createdAt={createdAt} />
            <StatRow {...totals} />

            <GradeSection track="sea" counts={counts} />
            <GradeSection track="river" counts={counts} />
            <GradeSection track="pinkston" counts={counts} />

            <SectionTitle>Approval ceiling</SectionTitle>
            <CeilingsCard ceilings={ceilings} />

            <SectionTitle>The journey</SectionTitle>
            <JourneyLadder level={level} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  adminCard: { backgroundColor: OtterPalette.slateNavy, borderColor: OtterPalette.slateNavy },
  adminKicker: {
    color: '#ffffff',
    opacity: 0.7,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  adminAction: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
});
