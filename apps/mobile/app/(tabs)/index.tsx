import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventPhoto } from '@/components/photo';
import { EmptyCard, ErrorCard, LoadingCenter } from '@/components/screen-states';
import { Card, Pill, Row, SectionTitle, TopBar } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoadOnFocus } from '@/hooks/use-load-on-focus';
import { useAuth } from '@/lib/auth';
import { LEVEL_EMOJI, LEVEL_RANK, ProgressionLevel } from '@/lib/progress';
import { supabase } from '@/lib/supabase';

const DISCIPLINES = ['All', 'Sea', 'River', 'Pinkston', 'Loch/Pool', 'Skills'] as const;
type Discipline = (typeof DISCIPLINES)[number];

type CalendarRow = {
  id: string;
  title: string;
  category: string;
  grade_advertised: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  min_level: string;
  max_participants: number | null;
  cost: number;
  status: string;
  leader_id: string;
  leader_name: string | null;
  leader_avatar_path: string | null;
  photo_path: string | null;
  confirmed_count: number;
};

function categoryToDiscipline(category: string): Discipline {
  if (category.startsWith('Sea Kayak')) return 'Sea';
  if (category === 'River Trip') return 'River';
  if (category.startsWith('Pinkston')) return 'Pinkston';
  if (category.startsWith('Tuesday') || category === 'Pool / Loch Sessions' || category === 'Night Paddle' || category === 'Second Saturday Paddle') return 'Loch/Pool';
  if (category.startsWith('Skills') || category.startsWith('Training')) return 'Skills';
  return 'Loch/Pool';
}

function pillForCategory(row: CalendarRow): { label: string; color: string } {
  const grade = row.grade_advertised;
  const cat = row.category;
  if (cat === 'Sea Kayak') {
    const colours: Record<string, string> = {
      'Sea A': OtterPalette.seaTeal[0],
      'Sea B': OtterPalette.seaTeal[1],
      'Sea C': OtterPalette.seaTeal[2],
    };
    return { label: grade ?? 'Sea', color: colours[grade ?? ''] ?? OtterPalette.seaTeal[1] };
  }
  if (cat === 'River Trip') return { label: grade ?? 'River', color: OtterPalette.riverGreen[1] };
  if (cat === 'Pinkston') {
    const colours: Record<string, string> = {
      P1: OtterPalette.pinkstonOrange[0],
      P2: OtterPalette.pinkstonOrange[1],
      P3: OtterPalette.pinkstonOrange[2],
    };
    return {
      label: grade ?? 'Pinkston',
      color: colours[grade ?? ''] ?? OtterPalette.pinkstonOrange[1],
    };
  }
  return { label: grade ?? cat, color: OtterPalette.lochPool };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

function formatPlaces(row: CalendarRow): string {
  if (row.status === 'full') return 'Waitlist';
  if (row.max_participants == null) return 'Open';
  const left = row.max_participants - row.confirmed_count;
  return `${left} of ${row.max_participants} left`;
}

function formatCost(cost: number): string {
  if (cost === 0) return 'Free';
  return `£${Number(cost).toFixed(0)}`;
}

export default function CalendarScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const { profile } = useAuth();
  const canCreate = profile?.level === 'selkie';
  const [active, setActive] = useState<Discipline>('All');
  const [query, setQuery] = useState('');
  const [openToMe, setOpenToMe] = useState(false);
  const [rows, setRows] = useState<CalendarRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const myRank = profile?.level ? LEVEL_RANK[profile.level] : undefined;

  const load = React.useCallback(async () => {
    setError(null);
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true });
    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as CalendarRow[]);
    }
  }, []);

  const { refreshing, onRefresh } = useLoadOnFocus(load);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (active !== 'All' && categoryToDiscipline(r.category) !== active) return false;
      if (openToMe && myRank !== undefined) {
        const need = LEVEL_RANK[r.min_level as ProgressionLevel] ?? 0;
        if (need > myRank) return false;
      }
      if (q.length > 0) {
        const hay = `${r.title} ${r.location ?? ''} ${r.leader_name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, active, query, openToMe, myRank]);

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: palette.background }]} edges={['top']}>
      {canCreate ? (
        <Pressable
          testID="calendar-create-event"
          onPress={() => router.push('/event/new')}
          style={[styles.fab, { backgroundColor: OtterPalette.slateNavy }]}>
          <Text style={styles.fabText}>＋ Create event</Text>
        </Pressable>
      ) : null}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <TopBar title="Calendar" subtitle="Upcoming club events" />

        <View style={styles.searchWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search title, location or leader"
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.search,
              { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
            ]}
          />
        </View>

        <View style={styles.disciplineRow}>
          {DISCIPLINES.map((d) => {
            const isActive = active === d;
            return (
              <Pressable key={d} onPress={() => setActive(d)} style={styles.disciplineBtn}>
                <Text
                  style={[
                    styles.disciplineText,
                    { color: isActive ? OtterPalette.slateNavy : palette.muted },
                    isActive && styles.disciplineTextActive,
                  ]}>
                  {d}
                </Text>
                {isActive ? (
                  <View
                    style={[styles.disciplineUnderline, { backgroundColor: OtterPalette.slateNavy }]}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {myRank !== undefined ? (
          <View style={styles.toggleRow}>
            <Pressable
              onPress={() => setOpenToMe((v) => !v)}
              style={[
                styles.togglePill,
                {
                  backgroundColor: openToMe ? OtterPalette.slateNavy : palette.surface,
                  borderColor: openToMe ? OtterPalette.slateNavy : palette.border,
                },
              ]}>
              <Text
                style={[
                  styles.toggleText,
                  { color: openToMe ? 'white' : palette.muted },
                ]}>
                {openToMe ? '✓ Open to me' : 'Open to me'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <SectionTitle>Upcoming</SectionTitle>

        {rows == null ? (
          <LoadingCenter />
        ) : error ? (
          <ErrorCard title="Couldn't load events" message={error} />
        ) : (filtered ?? []).length === 0 ? (
          <EmptyCard
            message={
              rows.length === 0
                ? 'No upcoming events yet. Add some in the Supabase dashboard.'
                : 'No events match your filters.'
            }
          />
        ) : (
          (filtered ?? []).map((ev) => {
            const pill = pillForCategory(ev);
            const levelEmoji = LEVEL_EMOJI[ev.min_level as ProgressionLevel] ?? '🦆';
            return (
              <Pressable
                key={ev.id}
                testID={`calendar-event-${ev.id}`}
                onPress={() => router.push(`/event/${ev.id}`)}>
                <Card>
                  <Row style={{ marginBottom: 10 }}>
                    <EventPhoto path={ev.photo_path} height={56} thumb />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.evTitle, { color: palette.text }]} numberOfLines={2}>
                        {ev.title}
                      </Text>
                      <Text style={[styles.evDate, { color: palette.muted }]}>
                        {formatDate(ev.starts_at)}
                      </Text>
                    </View>
                  </Row>

                  <Row style={{ flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    <Pill label={pill.label} color={pill.color} />
                    <Pill
                      label={`${levelEmoji} ${ev.min_level}`}
                      color="#e3e1dc"
                      textStyle={{ color: '#2a2f33' }}
                    />
                    <Pill
                      label={formatCost(ev.cost)}
                      color={palette.surface}
                      textStyle={{ color: palette.text }}
                    />
                  </Row>

                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={[styles.evMeta, { color: palette.muted }]}>
                      Leader · {ev.leader_name ?? '—'}
                    </Text>
                    <Text style={[styles.evMeta, { color: palette.text, fontWeight: '700' }]}>
                      {formatPlaces(ev)}
                    </Text>
                  </Row>
                </Card>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  search: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  togglePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  toggleText: { fontSize: 12, fontWeight: '600' },
  disciplineRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 18,
    marginBottom: 4,
  },
  disciplineBtn: { paddingVertical: 6 },
  disciplineText: { fontSize: 14, fontWeight: '500' },
  disciplineTextActive: { fontWeight: '700' },
  disciplineUnderline: {
    height: 2,
    marginTop: 4,
    borderRadius: 1,
  },
  evTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  evDate: { fontSize: 12 },
  evMeta: { fontSize: 12 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabText: { color: 'white', fontWeight: '700', fontSize: 14 },
});
