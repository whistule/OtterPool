import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PageTitle } from '@/components/page-title';
import { Avatar } from '@/components/photo';
import { EmptyCard, ErrorCard, LoadingCenter } from '@/components/screen-states';
import { WhatsAppButton } from '@/components/whatsapp-button';
import { Card, GreyBox, Pill, Row, SectionTitle, TopBar } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoadOnFocus } from '@/hooks/use-load-on-focus';
import { useAuth } from '@/lib/auth';
import { formatShortDate, formatShortDateTime } from '@/lib/datetime';
import { colorForGrade, LEVEL_EMOJI, type ProgressionLevel } from '@/lib/progress';
import { SIGNUP_STATUS, type SignupStatus } from '@/lib/status';
import { supabase } from '@/lib/supabase';

type TripEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  grade_advertised: string | null;
  grade_actual: string | null;
  category: { name: string } | null;
};

type SignupRow = {
  id: string;
  status: string;
  event: TripEvent | null;
};

type LedEventRow = TripEvent & {
  leader_id: string;
  assistant_id: string | null;
};

type TripRole = 'leader' | 'assistant';

// One row per event — either a trip I've signed up to, or one I'm leading /
// assistant-leading (leaders aren't sign-ups, they're on the event itself).
type TripRow = {
  event: TripEvent;
  status: string | null;
  role: TripRole | null;
};

const ROLE_PILL: Record<TripRole, { label: string; color: string }> = {
  leader: { label: 'Leading', color: OtterPalette.burntOrange },
  assistant: { label: 'Assisting', color: OtterPalette.slateNavy },
};

const EVENT_FIELDS =
  'id, title, starts_at, ends_at, grade_advertised, grade_actual, category:event_categories(name)';

function pillFor(row: TripRow): { label: string; color: string } | null {
  if (row.role) {
    return ROLE_PILL[row.role];
  }
  const info = row.status ? SIGNUP_STATUS[row.status as SignupStatus] : undefined;
  return info ? { label: info.shortLabel, color: info.color } : null;
}

type TallyRow = { bucket: string; count: number };

type GoingRow = {
  event_id: string;
  member_id: string;
  display_name: string | null;
  full_name: string | null;
  level: string;
  avatar_path: string | null;
};

const MAX_FACES = 4;
const FACE_SIZE = 28;

const nameOf = (p: GoingRow) => p.display_name ?? p.full_name ?? 'Paddler';

// Browser hover label. RN-web drops a `title` prop, so set it on the DOM node;
// phones have no hover, so this is web only.
const hoverTitle = (label: string) =>
  Platform.OS === 'web'
    ? (node: unknown) =>
        (node as { setAttribute?: (k: string, v: string) => void } | null)?.setAttribute?.(
          'title',
          label,
        )
    : undefined;

// Overlapping faces of the confirmed paddlers, then "+N" for the rest.
function GoingFaces({ people, ringColor }: { people: GoingRow[]; ringColor: string }) {
  const palette = Colors[useColorScheme() ?? 'light'];
  if (people.length === 0) {
    return null;
  }
  const shown = people.slice(0, MAX_FACES);
  const rest = people.slice(MAX_FACES);
  return (
    <View
      style={styles.faces}
      accessible
      accessibilityLabel={`${people.length} ${people.length === 1 ? 'paddler' : 'paddlers'} going`}
    >
      {shown.map((p, i) => (
        <View key={p.member_id} ref={hoverTitle(nameOf(p))} style={{ marginLeft: i === 0 ? 0 : -8 }}>
          <Avatar
            path={p.avatar_path}
            size={FACE_SIZE}
            fallback={LEVEL_EMOJI[p.level as ProgressionLevel]}
            style={[styles.face, { borderColor: ringColor }]}
          />
        </View>
      ))}
      {rest.length > 0 ? (
        <Text
          ref={hoverTitle(rest.map(nameOf).join(', '))}
          style={[styles.facesMore, { color: palette.muted }]}
        >
          +{rest.length}
        </Text>
      ) : null}
    </View>
  );
}

function bucketFor(
  categoryName: string | null | undefined,
  gradeAdvertised: string | null,
  gradeActual: string | null,
): string {
  const name = categoryName ?? '';
  // Graded disciplines read the grade off the event — the category names no
  // longer carry it. Mirrors the my_trip_tally view.
  if (name === 'Sea Kayak') {
    return gradeActual ?? gradeAdvertised ?? 'Sea';
  }
  if (name === 'River Trip') {
    return gradeActual ?? gradeAdvertised ?? 'River';
  }
  if (name === 'Pinkston') {
    return gradeActual ?? gradeAdvertised ?? 'Pinkston';
  }
  if (name.startsWith('Tuesday Evening')) {
    return 'Tuesday';
  }
  if (name === 'Pool / Loch Sessions') {
    return 'Loch';
  }
  if (name === 'Night Paddle') {
    return 'Night';
  }
  if (name === 'Second Saturday Paddle') {
    return '2nd Sat';
  }
  if (name.startsWith('Skills')) {
    return 'Skills';
  }
  if (name.startsWith('Training')) {
    return 'Training';
  }
  return name || '—';
}

// Past trips I led (or assistant-led), counted into the same buckets as the
// experience tally.
function leadingTally(rows: TripRow[], role: TripRole): TallyRow[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.role !== role) {
      continue;
    }
    const bucket = bucketFor(r.event.category?.name, r.event.grade_advertised, r.event.grade_actual);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return [...counts]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => b.count - a.count || a.bucket.localeCompare(b.bucket));
}

function colorForBucket(bucket: string): string {
  // Non-grade buckets have no ladder position; everything else is a grade.
  if (bucket === 'Skills' || bucket === 'Training') {
    return OtterPalette.slateNavy;
  }
  return colorForGrade(bucket);
}

export default function MyTripsScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const { session } = useAuth();

  const [upcoming, setUpcoming] = useState<TripRow[] | null>(null);
  const [past, setPast] = useState<TripRow[] | null>(null);
  const [tally, setTally] = useState<TallyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatUrls, setChatUrls] = useState<Map<string, string>>(new Map());
  const [going, setGoing] = useState<Map<string, GoingRow[]>>(new Map());

  const load = useCallback(async () => {
    if (!session) {
      setUpcoming([]);
      setPast([]);
      setTally([]);
      return;
    }
    setError(null);

    const uid = session.user.id;
    const [signupsRes, ledRes, tallyRes, chatRes] = await Promise.all([
      supabase
        .from('event_signups')
        .select(`id, status, event:events!inner(${EVENT_FIELDS})`)
        .eq('member_id', uid)
        .not('status', 'in', '(withdrawn,declined)'),
      supabase
        .from('events')
        .select(`${EVENT_FIELDS}, leader_id, assistant_id`)
        .or(`leader_id.eq.${uid},assistant_id.eq.${uid}`)
        .neq('status', 'cancelled'),
      supabase.from('my_trip_tally').select('bucket, count'),
      // RLS only returns links for trips I'm confirmed on or can edit.
      supabase.from('event_chat_links').select('event_id, url'),
    ]);

    // A missing chat link just means no button — never blocks the screen.
    setChatUrls(
      new Map(
        ((chatRes.data ?? []) as { event_id: string; url: string }[]).map((c) => [
          c.event_id,
          c.url,
        ]),
      ),
    );

    const loadError = signupsRes.error ?? ledRes.error;
    if (loadError) {
      setError(loadError.message);
      setUpcoming([]);
      setPast([]);
    } else {
      // Keyed by event so a trip you lead and are also signed up to shows once.
      const byEvent = new Map<string, TripRow>();
      for (const r of (signupsRes.data ?? []) as unknown as SignupRow[]) {
        if (r.event) {
          byEvent.set(r.event.id, { event: r.event, status: r.status, role: null });
        }
      }
      for (const e of (ledRes.data ?? []) as unknown as LedEventRow[]) {
        const role: TripRole = e.leader_id === uid ? 'leader' : 'assistant';
        byEvent.set(e.id, { event: e, status: byEvent.get(e.id)?.status ?? null, role });
      }

      const now = Date.now();
      const up: TripRow[] = [];
      const pa: TripRow[] = [];
      for (const r of byEvent.values()) {
        const endIso = r.event.ends_at ?? r.event.starts_at;
        if (new Date(endIso).getTime() >= now) {
          up.push(r);
        } else if (r.role || r.status === 'confirmed') {
          pa.push(r);
        }
      }
      up.sort(
        (a, b) => new Date(a.event.starts_at).getTime() - new Date(b.event.starts_at).getTime(),
      );
      pa.sort(
        (a, b) => new Date(b.event.starts_at).getTime() - new Date(a.event.starts_at).getTime(),
      );
      // Who's going on each upcoming trip — faces only, so a failure here
      // just leaves the row empty.
      const upIds = up.map((r) => r.event.id);
      const partRes = upIds.length
        ? await supabase
            .from('event_participants')
            .select('event_id, member_id, display_name, full_name, level, avatar_path')
            .in('event_id', upIds)
            .order('signed_up_at', { ascending: true })
        : { data: [] };
      const byTrip = new Map<string, GoingRow[]>();
      for (const p of (partRes.data ?? []) as GoingRow[]) {
        byTrip.set(p.event_id, [...(byTrip.get(p.event_id) ?? []), p]);
      }
      setGoing(byTrip);

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

  const { refreshing, onRefresh } = useLoadOnFocus(load);

  const isLoading = upcoming == null || past == null || tally == null;
  const ledTally = past ? leadingTally(past, 'leader') : [];
  const assistedTally = past ? leadingTally(past, 'assistant') : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }} edges={['top']}>
      <PageTitle title="My Trips" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <TopBar title="My Trips" subtitle="Upcoming and past" />

        {isLoading ? (
          <LoadingCenter />
        ) : error ? (
          <ErrorCard title="Couldn't load trips" message={error} />
        ) : (
          <>
            <SectionTitle>Upcoming</SectionTitle>
            {upcoming.length === 0 ? (
              <EmptyCard message="Nothing booked. Browse the calendar to find a trip." />
            ) : (
              upcoming.map((s) => {
                const ev = s.event;
                // The leader made the group, so they don't need the button.
                const chatUrl = s.role === 'leader' ? undefined : chatUrls.get(ev.id);
                const pill = pillFor(s);
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={ev.id}
                    onPress={() => router.push(`/event/${ev.id}`)}
                  >
                    <Card>
                      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={[styles.title, { color: palette.text }]}>{ev.title}</Text>
                          <Text style={[styles.date, { color: palette.muted }]}>
                            {formatShortDateTime(ev.starts_at)}
                          </Text>
                        </View>
                        <GoingFaces people={going.get(ev.id) ?? []} ringColor={palette.surface} />
                        <View style={styles.badges}>
                          {pill ? (
                            <Pill
                              label={pill.label}
                              color={pill.color}
                              style={styles.badge}
                              textStyle={styles.badgeText}
                            />
                          ) : null}
                          {chatUrl ? (
                            <WhatsAppButton url={chatUrl} testID="my-trips-whatsapp" compact />
                          ) : null}
                        </View>
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

            {ledTally.length > 0 || assistedTally.length > 0 ? (
              <>
                <SectionTitle>Leading tally</SectionTitle>
                <Card>
                  {ledTally.length > 0 ? (
                    <>
                      <Text style={[styles.tallyLabel, { color: palette.muted }]}>Led</Text>
                      <Row style={{ flexWrap: 'wrap', gap: 8 }}>
                        {ledTally.map((t) => (
                          <Pill
                            key={t.bucket}
                            label={`${t.bucket} · ${t.count}`}
                            color={colorForBucket(t.bucket)}
                          />
                        ))}
                      </Row>
                    </>
                  ) : null}
                  {assistedTally.length > 0 ? (
                    <>
                      <Text
                        style={[
                          styles.tallyLabel,
                          { color: palette.muted, marginTop: ledTally.length > 0 ? 12 : 0 },
                        ]}
                      >
                        Assisted
                      </Text>
                      <Row style={{ flexWrap: 'wrap', gap: 8 }}>
                        {assistedTally.map((t) => (
                          <Pill
                            key={t.bucket}
                            label={`${t.bucket} · ${t.count}`}
                            color={colorForBucket(t.bucket)}
                          />
                        ))}
                      </Row>
                    </>
                  ) : null}
                </Card>
              </>
            ) : null}

            <SectionTitle>Past trips</SectionTitle>
            {past.length === 0 ? (
              <EmptyCard message="No past trips yet." />
            ) : (
              past.map((s) => {
                const ev = s.event;
                const bucket = bucketFor(ev.category?.name, ev.grade_advertised, ev.grade_actual);
                const rolePill = s.role ? ROLE_PILL[s.role] : null;
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={ev.id}
                    onPress={() => router.push(`/event/${ev.id}`)}
                  >
                    <Card>
                      <Row>
                        <GreyBox height={44} style={{ width: 44, borderRadius: 8 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.title, { color: palette.text }]}>{ev.title}</Text>
                          <Text style={[styles.date, { color: palette.muted }]}>
                            {formatShortDate(ev.starts_at)} · {bucket}
                          </Text>
                        </View>
                        {rolePill ? <Pill label={rolePill.label} color={rolePill.color} /> : null}
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
  faces: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  face: { borderWidth: 2 },
  facesMore: { fontSize: 12, fontWeight: '700', marginLeft: 4 },
  // Matches the compact WhatsApp button's height so the two sit level.
  badge: { height: 30, justifyContent: 'center', paddingHorizontal: 12, alignSelf: 'center' },
  badgeText: { fontSize: 12 },
  // Status pill then WhatsApp button; wraps to a second line on narrow phones.
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  tallyLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
});
