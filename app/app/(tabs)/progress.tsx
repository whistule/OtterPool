import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, Pill, Row, Screen, SectionTitle, Stat, TopBar } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const LADDER = [
  { emoji: '🐸', label: 'Frog', achieved: true },
  { emoji: '🦆', label: 'Duck', achieved: true },
  { emoji: '🦦', label: 'Otter', achieved: true, current: true },
  { emoji: '🐬', label: 'Dolphin', achieved: false },
  { emoji: '🦭', label: 'Selkie', achieved: false },
];

export default function ProgressScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];

  return (
    <Screen>
      <TopBar title="Progress" subtitle="Your journey" />

      <Card>
        <Text style={[styles.kicker, { color: palette.muted }]}>Current level</Text>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <Row style={{ gap: 12 }}>
            <Text style={{ fontSize: 44 }}>🦦</Text>
            <View>
              <Text style={[styles.levelName, { color: palette.text }]}>Otter</Text>
              <Text style={[styles.levelDesc, { color: palette.muted }]}>
                Reliable on-water rescue
              </Text>
            </View>
          </Row>
          <Pill label="Level 3 of 4" color={OtterPalette.slateNavy} />
        </Row>
      </Card>

      <SectionTitle>Journey ladder</SectionTitle>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          {LADDER.map((step, i) => (
            <View key={i} style={styles.ladderStep}>
              <View
                style={[
                  styles.ladderCircle,
                  {
                    backgroundColor: step.current
                      ? OtterPalette.slateNavy
                      : step.achieved
                      ? '#d6e2ed'
                      : '#ececec',
                    opacity: step.achieved || step.current ? 1 : 0.5,
                  },
                ]}>
                <Text style={{ fontSize: 22 }}>{step.emoji}</Text>
              </View>
              <Text
                style={[
                  styles.ladderLabel,
                  {
                    color: step.current ? OtterPalette.slateNavy : palette.muted,
                    fontWeight: step.current ? '700' : '500',
                  },
                ]}>
                {step.label}
              </Text>
            </View>
          ))}
        </Row>
      </Card>

      <SectionTitle>Stats</SectionTitle>
      <Card>
        <Row>
          <Stat value="18" label="Trips" />
          <Stat value="2y" label="Member" />
          <Stat value="4" label="Tracks" />
        </Row>
      </Card>

      <SectionTitle>Sea grades</SectionTitle>
      <Card>
        <Row style={{ flexWrap: 'wrap', gap: 8 }}>
          <Pill label="Sea A · 3" color={OtterPalette.seaTeal[0]} />
          <Pill label="Sea B · 1" color={OtterPalette.seaTeal[1]} />
          <Pill label="Sea C · –" color="#e3e1dc" textStyle={{ color: '#6b7178' }} />
        </Row>
      </Card>

      <SectionTitle>River grades</SectionTitle>
      <Card>
        <Row style={{ flexWrap: 'wrap', gap: 8 }}>
          <Pill label="G1 · 2" color={OtterPalette.riverGreen[0]} />
          <Pill label="G1/2 · 4" color={OtterPalette.riverGreen[0]} />
          <Pill label="G2 · 1" color={OtterPalette.riverGreen[1]} />
          <Pill label="G3 · –" color="#e3e1dc" textStyle={{ color: '#6b7178' }} />
        </Row>
      </Card>

      <SectionTitle>Pinkston pumps</SectionTitle>
      <Card>
        <Row style={{ flexWrap: 'wrap', gap: 8 }}>
          <Pill label="P1 · 6" color={OtterPalette.pinkstonOrange[0]} />
          <Pill label="P2 · 2" color={OtterPalette.pinkstonOrange[1]} />
          <Pill label="P3 · –" color="#e3e1dc" textStyle={{ color: '#6b7178' }} />
        </Row>
      </Card>

      <SectionTitle>Approval ceiling</SectionTitle>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={[styles.muted, { color: palette.muted }]}>Sea</Text>
          <Text style={[styles.value, { color: palette.text }]}>Up to Sea B</Text>
        </Row>
        <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={[styles.muted, { color: palette.muted }]}>River</Text>
          <Text style={[styles.value, { color: palette.text }]}>Up to G2</Text>
        </Row>
        <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={[styles.muted, { color: palette.muted }]}>Pinkston</Text>
          <Text style={[styles.value, { color: palette.text }]}>Up to P2</Text>
        </Row>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  levelName: { fontSize: 22, fontWeight: '700' },
  levelDesc: { fontSize: 12, marginTop: 2 },
  ladderStep: { alignItems: 'center', flex: 1 },
  ladderCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  ladderLabel: { fontSize: 11 },
  muted: { fontSize: 13 },
  value: { fontSize: 13, fontWeight: '600' },
});
