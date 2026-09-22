import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type DayCell, DateStrip } from '@/components/date-strip';
import { MembershipPopup } from '@/components/membership-popup';
import { PageTitle } from '@/components/page-title';
import { EventPhoto } from '@/components/photo';
import { EmptyCard, ErrorCard, LoadingCenter } from '@/components/screen-states';
import { Card, Pill, Row, TopBar } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoadOnFocus } from '@/hooks/use-load-on-focus';
import { roleFlags, useAuth } from '@/lib/auth';
import { formatShortRange } from '@/lib/datetime';
import { categoryChip } from '@/lib/event-form-utils';
import { colorForGrade, LEVEL_EMOJI, ProgressionLevel } from '@/lib/progress';
import { supabase } from '@/lib/supabase';
import { formatCost } from '@/lib/money';

const DISCIPLINES = ['All', 'Sea', 'River', 'Pinkston', 'Loch/Pool', 'Skills'] as const;
type Discipline = (typeof DISCIPLINES)[number];

// Colour dot per discipline in the filter row (matches the prototype). 'All'
// has none. Colours line up with the per-event category chips.
const DISCIPLINE_COLOR: Record<string, string | undefined> = {
  Sea: OtterPalette.seaTeal[1],
  River: OtterPalette.riverGreen[1],
  Pinkston: OtterPalette.pinkstonOrange[0],
  'Loch/Pool': OtterPalette.lochPool,
  Skills: OtterPalette.slateNavy,
};

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

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const pad2 = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const keyFromIso = (iso: string) => dateKey(new Date(iso));

function categoryToDiscipline(category: string): Discipline {
  if (category.startsWith('Sea Kayak')) {
    return 'Sea';
  }
  if (category === 'River Trip') {
    return 'River';
  }
  if (category.startsWith('Pinkston')) {
    return 'Pinkston';
  }
  if (
    category.startsWith('Tuesday') ||
    category === 'Pool / Loch Sessions' ||
    category === 'Night Paddle' ||
    category === 'Second Saturday Paddle'
  ) {
    return 'Loch/Pool';
  }
  if (category.startsWith('Skills') || category.startsWith('Training')) {
    return 'Skills';
  }
  return 'Loch/Pool';
}

function pillForCategory(row: CalendarRow): { label: string; color: string } {
  // A grade is the most specific thing we can show, and colorForGrade is the
  // single source of truth for its colour.
  if (row.grade_advertised) {
    return { label: row.grade_advertised, color: colorForGrade(row.grade_advertised) };
  }
  // Ungraded: use the shared per-discipline chip (distinct colour + short
  // label per discipline, including variants), so pool / loch / skills etc.
  // don't all collapse to one colour.
  return categoryChip(row.category);
}

function formatPlaces(row: CalendarRow): string {
  if (row.status === 'full') {
    return 'Waitlist';
  }
  if (row.max_participants == null) {
    return 'Open';
  }
  const left = row.max_participants - row.confirmed_count;
  return `${left} of ${row.max_participants} left`;
}

export default function CalendarScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const { profile } = useAuth();
  // Same gate the create form enforces (components/event-form.tsx): Selkies
  // create events, and paddling/super admins can too whatever their level.
  const canCreate = profile?.level === 'selkie' || roleFlags(profile).paddlingAdmin;
  const [active, setActive] = useState<Discipline>('All');
  const [subFilter, setSubFilter] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CalendarRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Switching discipline resets its sub-category (grades differ per discipline).
  const selectDiscipline = (d: Discipline) => {
    setActive(d);
    setSubFilter(null);
  };

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
    if (!rows) {
      return null;
    }
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (active !== 'All' && categoryToDiscipline(r.category) !== active) {
        return false;
      }
      if (subFilter && r.grade_advertised !== subFilter) {
        return false;
      }
      if (q.length > 0) {
        const hay = `${r.title} ${r.location ?? ''} ${r.leader_name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [rows, active, subFilter, query]);

  // Grades present in the active discipline → the dynamic sub-category filter.
  // Derived from the events themselves, so it only ever offers real options.
  const subCategories = useMemo(() => {
    if (!rows || active === 'All') {
      return [];
    }
    const seen = new Set<string>();
    for (const r of rows) {
      if (categoryToDiscipline(r.category) === active && r.grade_advertised) {
        seen.add(r.grade_advertised);
      }
    }
    return [...seen].sort();
  }, [rows, active]);

  // Per-day info for the fortnight strip, from the (discipline/sub/search)
  // filtered set — so the pills reflect the current filters.
  const days = useMemo<DayCell[]>(() => {
    const counts = new Map<string, { count: number; color?: string }>();
    for (const r of filtered ?? []) {
      const key = keyFromIso(r.starts_at);
      const cur = counts.get(key);
      if (cur) {
        cur.count += 1;
      } else {
        counts.set(key, { count: 1, color: pillForCategory(r).color });
      }
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const todayKey = dateKey(start);
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = dateKey(d);
      const info = counts.get(key);
      return {
        key,
        weekday: WEEKDAY[d.getDay()],
        day: d.getDate(),
        count: info?.count ?? 0,
        color: info?.color,
        isToday: key === todayKey,
      };
    });
  }, [filtered]);

  // The list actually shown: the filtered set, narrowed to a picked day.
  const visible = useMemo(() => {
    if (!filtered) {
      return null;
    }
    return selectedDay ? filtered.filter((r) => keyFromIso(r.starts_at) === selectedDay) : filtered;
  }, [filtered, selectedDay]);

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: palette.background }]} edges={['top']}>
      <PageTitle title="Calendar" />
      {canCreate ? (
        <Pressable
          testID="calendar-create-event"
          onPress={() => router.push('/event/new')}
          style={[styles.fab, { backgroundColor: OtterPalette.slateNavy }]}
        >
          <Text style={styles.fabText}>＋ Create event</Text>
        </Pressable>
      ) : null}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
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
              {
                color: palette.text,
                borderColor: palette.border,
                backgroundColor: palette.surface,
              },
            ]}
          />
        </View>

        <View style={styles.disciplineRow}>
          {DISCIPLINES.map((d) => {
            const isActive = active === d;
            return (
              <Pressable key={d} onPress={() => selectDiscipline(d)} style={styles.disciplineBtn}>
                <Row style={{ gap: 5, alignItems: 'center' }}>
                  {DISCIPLINE_COLOR[d] ? (
                    <View style={[styles.discDot, { backgroundColor: DISCIPLINE_COLOR[d] }]} />
                  ) : null}
                  <Text
                    style={[
                      styles.disciplineText,
                      { color: isActive ? OtterPalette.slateNavy : palette.muted },
                      isActive && styles.disciplineTextActive,
                    ]}
                  >
                    {d}
                  </Text>
                </Row>
                {isActive ? (
                  <View
                    style={[
                      styles.disciplineUnderline,
                      { backgroundColor: OtterPalette.slateNavy },
                    ]}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <DateStrip
          days={days}
          selected={selectedDay}
          onSelect={setSelectedDay}
          mutedColor={palette.muted}
          textColor={palette.text}
          borderColor={palette.border}
          background={palette.background}
        />

        <View style={styles.listHeader}>
          <Text style={[styles.listHeading, { color: palette.text }]}>
            {selectedDay
              ? new Date(`${selectedDay}T00:00:00`).toLocaleDateString('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })
              : 'Upcoming'}
          </Text>
          {subCategories.length > 0 ? (
            <View style={styles.subRowInline}>
              {subCategories.map((g) => {
                const on = subFilter === g;
                const color = DISCIPLINE_COLOR[active] ?? OtterPalette.slateNavy;
                return (
                  <Pressable
                    key={g}
                    testID={`subcat-${g}`}
                    onPress={() => setSubFilter(on ? null : g)}
                    style={[
                      styles.subChip,
                      { borderColor: color, backgroundColor: on ? color : 'transparent' },
                    ]}
                  >
                    <Text style={[styles.subChipText, { color: on ? '#fff' : color }]}>{g}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
        {selectedDay ? (
          <Pressable onPress={() => setSelectedDay(null)} style={styles.showAll}>
            <Text style={[styles.showAllText, { color: OtterPalette.slateNavy }]}>
              Show all days
            </Text>
          </Pressable>
        ) : null}

        {rows == null ? (
          <LoadingCenter />
        ) : error ? (
          <ErrorCard title="Couldn't load events" message={error} />
        ) : (visible ?? []).length === 0 ? (
          <EmptyCard
            message={
              rows.length === 0
                ? 'No upcoming trips yet. Check back soon.'
                : selectedDay
                  ? 'No events on this day.'
                  : 'No events match your filters.'
            }
          />
        ) : (
          (visible ?? []).map((ev) => {
            const pill = pillForCategory(ev);
            const levelEmoji = LEVEL_EMOJI[ev.min_level as ProgressionLevel] ?? '🦆';
            return (
              <Pressable
                key={ev.id}
                testID={`calendar-event-${ev.id}`}
                onPress={() => router.push(`/event/${ev.id}`)}
              >
                <Card>
                  <Row style={{ marginBottom: 10 }}>
                    <EventPhoto path={ev.photo_path} height={56} thumb />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.evTitle, { color: palette.text }]} numberOfLines={2}>
                        {ev.title}
                      </Text>
                      <Text style={[styles.evDate, { color: palette.muted }]}>
                        {formatShortRange(ev.starts_at, ev.ends_at)}
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
      <MembershipPopup />
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
  discDot: { width: 8, height: 8, borderRadius: 4 },
  disciplineText: { fontSize: 14, fontWeight: '500' },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    marginTop: 18,
    marginBottom: 10,
  },
  listHeading: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    opacity: 0.6,
  },
  subRowInline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    flexShrink: 1,
    justifyContent: 'flex-end',
  },
  subChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5 },
  subChipText: { fontSize: 13, fontWeight: '600' },
  showAll: { alignSelf: 'flex-end', paddingHorizontal: 20, marginTop: -6, marginBottom: 4 },
  showAllText: { fontSize: 13, fontWeight: '700' },
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
