import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Pill, Row, SectionTitle, Stat } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  colorForGrade,
  LEVEL_DESC,
  LEVEL_EMOJI,
  LEVEL_LABEL,
  LEVEL_ORDER,
  memberSinceLabel,
  PINKSTON_GRADES,
  ProgressionLevel,
  RIVER_GRADES,
  SEA_GRADES,
  Track,
  TRACK_LABEL,
} from '@/lib/progress';

export function CurrentLevelCard({
  level,
  createdAt,
}: {
  level: ProgressionLevel;
  createdAt: string | null;
}) {
  const palette = Colors[useColorScheme() ?? 'light'];
  return (
    <Card>
      <Text style={[styles.kicker, { color: palette.muted }]}>Current level</Text>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <Row style={{ gap: 12 }}>
          <Text style={{ fontSize: 44 }}>{LEVEL_EMOJI[level]}</Text>
          <View>
            <Text style={[styles.levelName, { color: palette.text }]}>{LEVEL_LABEL[level]}</Text>
            <Text style={[styles.levelDesc, { color: palette.muted }]}>{LEVEL_DESC[level]}</Text>
          </View>
        </Row>
      </Row>
      <Text style={[styles.tenure, { color: palette.muted }]}>{memberSinceLabel(createdAt)}</Text>
    </Card>
  );
}

export function StatRow({
  trips,
  sea,
  river,
  pinkston,
}: {
  trips: number;
  sea: number;
  river: number;
  pinkston: number;
}) {
  return (
    <Card>
      <Row>
        <Stat value={String(trips)} label="Trips" />
        <Stat value={String(sea)} label="Sea" />
        <Stat value={String(river)} label="River" />
        <Stat value={String(pinkston)} label="Pinkston" />
      </Row>
    </Card>
  );
}

function GradeGrid({
  grades,
  counts,
}: {
  grades: readonly string[];
  counts: Record<string, number>;
}) {
  const palette = Colors[useColorScheme() ?? 'light'];
  return (
    <Card>
      <Row style={{ flexWrap: 'wrap', gap: 8 }}>
        {grades.map((g) => {
          const n = counts[g] ?? 0;
          if (n === 0) {
            return (
              <Pill
                key={g}
                label={`${g} · –`}
                color={palette.border}
                textStyle={{ color: palette.muted }}
              />
            );
          }
          return <Pill key={g} label={`${g} · ${n}`} color={colorForGrade(g)} />;
        })}
      </Row>
    </Card>
  );
}

export function GradeSection({
  track,
  counts,
}: {
  track: Track;
  counts: Record<string, number>;
}) {
  const grades =
    track === 'sea' ? SEA_GRADES : track === 'river' ? RIVER_GRADES : PINKSTON_GRADES;
  return (
    <>
      <SectionTitle>{TRACK_LABEL[track]} grades</SectionTitle>
      <GradeGrid grades={grades} counts={counts} />
    </>
  );
}

export function JourneyLadder({ level }: { level: ProgressionLevel }) {
  const palette = Colors[useColorScheme() ?? 'light'];
  const idx = LEVEL_ORDER.indexOf(level);
  return (
    <Card>
      {LEVEL_ORDER.map((l, i) => {
        const done = i < idx;
        const current = i === idx;
        const future = i > idx;
        const color = future ? palette.muted : palette.text;
        const sub = done ? 'Achieved' : current ? 'You are here' : 'Keep paddling';
        return (
          <Row
            key={l}
            style={[
              styles.journeyRow,
              i < LEVEL_ORDER.length - 1 && {
                borderBottomWidth: 1,
                borderBottomColor: palette.border,
              },
            ]}>
            <View
              style={[
                styles.journeyCircle,
                {
                  backgroundColor: current
                    ? OtterPalette.slateNavy
                    : done
                    ? '#d6e2ed'
                    : palette.border,
                  opacity: future ? 0.55 : 1,
                },
              ]}>
              <Text style={{ fontSize: 20 }}>{LEVEL_EMOJI[l]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.journeyName, { color, fontWeight: current ? '700' : '500' }]}>
                {LEVEL_LABEL[l]}
              </Text>
              <Text style={[styles.journeySub, { color: palette.muted }]}>{sub}</Text>
            </View>
            {done ? <Text style={[styles.tick, { color: OtterPalette.forest }]}>✓</Text> : null}
            {current ? (
              <Pill label="Now" color={OtterPalette.slateNavy} />
            ) : null}
          </Row>
        );
      })}
    </Card>
  );
}

export type Ceiling = { track: Track; ceiling: string | null };

export function CeilingsCard({
  ceilings,
  onPressTrack,
}: {
  ceilings: Ceiling[];
  onPressTrack?: (track: Track) => void;
}) {
  const palette = Colors[useColorScheme() ?? 'light'];
  const map: Record<Track, string | null> = { sea: null, river: null, pinkston: null };
  for (const c of ceilings) map[c.track] = c.ceiling;
  const tracks: Track[] = ['sea', 'river', 'pinkston'];
  return (
    <Card>
      {tracks.map((t, i) => {
        const ceiling = map[t];
        const value = ceiling ? `Up to ${ceiling}` : 'Not set';
        const row = (
          <Row
            style={[
              styles.ceilingRow,
              i < tracks.length - 1 && {
                borderBottomWidth: 1,
                borderBottomColor: palette.border,
              },
            ]}>
            <Text style={[styles.ceilingLabel, { color: palette.muted }]}>{TRACK_LABEL[t]}</Text>
            <Text
              style={[
                styles.ceilingValue,
                { color: ceiling ? palette.text : palette.muted },
              ]}>
              {value}
            </Text>
            {onPressTrack ? (
              <Text style={[styles.ceilingChevron, { color: palette.muted }]}>›</Text>
            ) : null}
          </Row>
        );
        if (onPressTrack) {
          return (
            <Pressable
              key={t}
              onPress={() => onPressTrack(t)}
              testID={`ceiling-row-${t}`}>
              {row}
            </Pressable>
          );
        }
        return (
          <View key={t} testID={`ceiling-row-${t}`}>
            {row}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  kicker: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  levelName: { fontSize: 22, fontWeight: '700' },
  levelDesc: { fontSize: 12, marginTop: 2 },
  tenure: { fontSize: 12, marginTop: 12, fontStyle: 'italic' },
  journeyRow: { paddingVertical: 10, gap: 12 },
  journeyCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  journeyName: { fontSize: 14 },
  journeySub: { fontSize: 11, marginTop: 2 },
  tick: { fontSize: 16, fontWeight: '700' },
  ceilingRow: { paddingVertical: 12, gap: 10 },
  ceilingLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    width: 80,
  },
  ceilingValue: { flex: 1, fontSize: 14, fontWeight: '600' },
  ceilingChevron: { fontSize: 18 },
});
