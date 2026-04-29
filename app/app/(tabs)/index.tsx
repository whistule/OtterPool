import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, GreyBox, Pill, Row, SectionTitle, TopBar } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
  confirmed_count: number;
};

const LEVEL_EMOJI: Record<string, string> = {
  frog: '🐸',
  duck: '🦆',
  otter: '🦦',
  dolphin: '🐬',
  selkie: '🦭',
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
  if (cat.startsWith('Sea Kayak')) {
    if (cat.includes('A Trip')) return { label: grade ?? 'Sea A', color: OtterPalette.seaTeal[0] };
    if (cat.includes('B Trip')) return { label: grade ?? 'Sea B', color: OtterPalette.seaTeal[1] };
    if (cat.includes('C Trip')) return { label: grade ?? 'Sea C', color: OtterPalette.seaTeal[2] };
    return { label: grade ?? 'Sea', color: OtterPalette.seaTeal[1] };
  }
  if (cat === 'River Trip') return { label: grade ?? 'River', color: OtterPalette.riverGreen[1] };
  if (cat.startsWith('Pinkston')) {
    if (cat.includes('1')) return { label: 'P1', color: OtterPalette.pinkstonOrange[0] };
    if (cat.includes('2')) return { label: 'P2', color: OtterPalette.pinkstonOrange[1] };
    if (cat.includes('3')) return { label: 'P3', color: OtterPalette.pinkstonOrange[2] };
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
  const [active, setActive] = useState<Discipline>('All');
  const [rows, setRows] = useState<CalendarRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    if (active === 'All') return rows;
    return rows.filter((r) => categoryToDiscipline(r.category) === active);
  }, [rows, active]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: palette.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <TopBar title="Calendar" subtitle="Upcoming club events" />

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

        <SectionTitle>Upcoming</SectionTitle>

        {rows == null ? (
          <View style={styles.center}>
            <ActivityIndicator color={palette.tint} />
          </View>
        ) : error ? (
          <Card>
            <Text style={[styles.errTitle, { color: OtterPalette.ice }]}>
              Couldn't load events
            </Text>
            <Text style={[styles.errBody, { color: palette.muted }]}>{error}</Text>
          </Card>
        ) : (filtered ?? []).length === 0 ? (
          <Card>
            <Text style={[styles.empty, { color: palette.muted }]}>
              {rows.length === 0
                ? 'No upcoming events yet. Add some in the Supabase dashboard.'
                : `No upcoming ${active} events.`}
            </Text>
          </Card>
        ) : (
          (filtered ?? []).map((ev) => {
            const pill = pillForCategory(ev);
            const levelEmoji = LEVEL_EMOJI[ev.min_level] ?? '🦆';
            return (
              <Card key={ev.id}>
                <Row style={{ marginBottom: 10 }}>
                  <GreyBox height={56} style={{ width: 56, borderRadius: 10 }} />
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
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  center: { padding: 32, alignItems: 'center' },
  errTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  errBody: { fontSize: 12 },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },
});
