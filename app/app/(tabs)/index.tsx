import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, GreyBox, Pill, Row, Screen, SectionTitle, TopBar } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const DISCIPLINES = ['All', 'Sea', 'River', 'Pinkston', 'Loch/Pool', 'Skills'] as const;

const EVENTS = [
  {
    title: 'Tuesday Evening — Loch Lomond',
    category: 'Loch/Pool',
    date: 'Tue 5 May · 18:30',
    level: '🦆 Duck',
    places: '4 of 12 left',
    cost: '£5',
    leader: 'Anna MacLeod',
    accent: OtterPalette.lochPool,
    gradePill: { label: 'Loch', color: OtterPalette.lochPool },
  },
  {
    title: 'Sea B — Cumbrae circumnavigation',
    category: 'Sea',
    date: 'Sat 9 May · 09:00',
    level: '🦦 Otter',
    places: '2 of 8 left',
    cost: '£0',
    leader: 'Jamie Reid',
    accent: OtterPalette.seaTeal[1],
    gradePill: { label: 'Sea B', color: OtterPalette.seaTeal[1] },
  },
  {
    title: 'River — Tummel G2/3',
    category: 'River',
    date: 'Sun 10 May · 10:00',
    level: '🦦 Otter',
    places: 'Waitlist',
    cost: '£0',
    leader: 'Chris Murray',
    accent: OtterPalette.riverGreen[1],
    gradePill: { label: 'G2/3', color: OtterPalette.riverGreen[1] },
  },
  {
    title: 'Pinkston — 2 Pumps',
    category: 'Pinkston',
    date: 'Wed 13 May · 19:00',
    level: '🦆 Duck',
    places: '6 of 10 left',
    cost: '£8',
    leader: 'Siobhan Daly',
    accent: OtterPalette.pinkstonOrange[1],
    gradePill: { label: 'P2', color: OtterPalette.pinkstonOrange[1] },
  },
];

export default function CalendarScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const [active, setActive] = useState<string>('All');

  return (
    <Screen>
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
                <View style={[styles.disciplineUnderline, { backgroundColor: OtterPalette.slateNavy }]} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <SectionTitle>This week</SectionTitle>

      {EVENTS.map((ev, i) => (
        <Card key={i}>
          <Row style={{ marginBottom: 10 }}>
            <GreyBox height={56} style={{ width: 56, borderRadius: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.evTitle, { color: palette.text }]} numberOfLines={2}>
                {ev.title}
              </Text>
              <Text style={[styles.evDate, { color: palette.muted }]}>{ev.date}</Text>
            </View>
          </Row>

          <Row style={{ flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            <Pill label={ev.gradePill.label} color={ev.gradePill.color} />
            <Pill label={ev.level} color="#e3e1dc" textStyle={{ color: '#2a2f33' }} />
            <Pill label={ev.cost} color={palette.surface} textStyle={{ color: palette.text }} />
          </Row>

          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={[styles.evMeta, { color: palette.muted }]}>Leader · {ev.leader}</Text>
            <Text style={[styles.evMeta, { color: palette.text, fontWeight: '700' }]}>{ev.places}</Text>
          </Row>
        </Card>
      ))}
    </Screen>
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
});
