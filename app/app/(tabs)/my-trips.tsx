import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, GreyBox, Pill, Row, Screen, SectionTitle, TopBar } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const UPCOMING = [
  { title: 'Tuesday Evening — Loch Lomond', date: 'Tue 5 May · 18:30', status: 'Confirmed' },
  { title: 'Sea B — Cumbrae circumnavigation', date: 'Sat 9 May · 09:00', status: 'Pending review' },
];

const PAST = [
  { title: 'Pinkston — 1 Pump', date: '22 Apr', grade: 'P1', emoji: '🙂' },
  { title: 'Tuesday Evening — Loch Lomond', date: '15 Apr', grade: 'Loch', emoji: '😁' },
  { title: 'River — Endrick G1/2', date: '5 Apr', grade: 'G1/2', emoji: '🤨' },
  { title: 'Sea A — Loch Long', date: '29 Mar', grade: 'Sea A', emoji: '😁' },
];

export default function MyTripsScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];

  return (
    <Screen>
      <TopBar title="My Trips" subtitle="Upcoming and past" />

      <SectionTitle>Upcoming</SectionTitle>
      {UPCOMING.map((t, i) => (
        <Card key={i}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.title, { color: palette.text }]}>{t.title}</Text>
              <Text style={[styles.date, { color: palette.muted }]}>{t.date}</Text>
            </View>
            <Pill
              label={t.status}
              color={t.status === 'Confirmed' ? OtterPalette.forest : OtterPalette.burntOrange}
            />
          </Row>
        </Card>
      ))}

      <SectionTitle>Experience tally</SectionTitle>
      <Card>
        <Row style={{ flexWrap: 'wrap', gap: 8 }}>
          <Pill label="Sea A · 3" color={OtterPalette.seaTeal[0]} />
          <Pill label="Sea B · 1" color={OtterPalette.seaTeal[1]} />
          <Pill label="G1 · 2" color={OtterPalette.riverGreen[0]} />
          <Pill label="G1/2 · 4" color={OtterPalette.riverGreen[1]} />
          <Pill label="P1 · 6" color={OtterPalette.pinkstonOrange[0]} />
          <Pill label="P2 · 2" color={OtterPalette.pinkstonOrange[1]} />
        </Row>
      </Card>

      <SectionTitle>Past trips</SectionTitle>
      {PAST.map((t, i) => (
        <Card key={i}>
          <Row>
            <GreyBox height={44} style={{ width: 44, borderRadius: 8 }} label={t.emoji} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: palette.text }]}>{t.title}</Text>
              <Text style={[styles.date, { color: palette.muted }]}>
                {t.date} · {t.grade}
              </Text>
            </View>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  date: { fontSize: 12 },
});
