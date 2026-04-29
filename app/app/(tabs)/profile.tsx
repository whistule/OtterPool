import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, GreyBox, Pill, Row, Screen, SectionTitle, TopBar } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const FIELDS = [
  { label: 'Full name', value: 'Robert Plant' },
  { label: 'Email', value: 'robert@example.co.uk' },
  { label: 'Phone', value: '07700 900123' },
  { label: 'Date of birth', value: '14 Jul 1985' },
  { label: 'BC membership', value: '12345678' },
];

const ICE = [
  { name: 'Anna Plant', rel: 'Partner', phone: '07700 900456' },
  { name: 'David Plant', rel: 'Brother', phone: '07700 900789' },
];

const LEAVING = [
  { label: 'Email me my data', tone: 'neutral' as const },
  { label: 'Leave the club, keep my data', tone: 'neutral' as const },
  { label: 'Leave the club and delete everything', tone: 'destructive' as const },
];

export default function ProfileScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];

  return (
    <Screen>
      <TopBar title="Profile" subtitle="Your details and settings" />

      <Card>
        <Row style={{ gap: 14 }}>
          <GreyBox height={64} style={{ width: 64, borderRadius: 32 }} label="🦦" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: palette.text }]}>Robert Plant</Text>
            <Row style={{ gap: 6, marginTop: 4 }}>
              <Pill label="🦦 Otter" color={OtterPalette.slateNavy} />
              <Pill label="Full member" color={OtterPalette.forest} />
            </Row>
          </View>
        </Row>
      </Card>

      <SectionTitle>Personal details</SectionTitle>
      <Card>
        {FIELDS.map((f, i) => (
          <View
            key={f.label}
            style={[
              styles.fieldRow,
              i < FIELDS.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.border },
            ]}>
            <Text style={[styles.fieldLabel, { color: palette.muted }]}>{f.label}</Text>
            <Text style={[styles.fieldValue, { color: palette.text }]}>{f.value}</Text>
          </View>
        ))}
      </Card>

      <SectionTitle>Emergency contacts</SectionTitle>
      {ICE.map((c, i) => (
        <Card key={i}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Text style={[styles.iceName, { color: palette.text }]}>{c.name}</Text>
              <Text style={[styles.iceMeta, { color: palette.muted }]}>
                {c.rel} · {c.phone}
              </Text>
            </View>
            <Pill label="ICE" color={OtterPalette.ice} />
          </Row>
        </Card>
      ))}
      <Card style={{ alignItems: 'center' }}>
        <Text style={[styles.addLink, { color: OtterPalette.slateNavy }]}>+ Add contact</Text>
      </Card>

      <SectionTitle>Medical</SectionTitle>
      <Card>
        <Text style={[styles.muted, { color: palette.muted }]}>Conditions / allergies</Text>
        <Text style={[styles.body, { color: palette.text, marginTop: 4 }]}>
          Asthma — inhaler in PFD chest pocket
        </Text>
        <Text style={[styles.muted, { color: palette.muted, marginTop: 12 }]}>Visibility</Text>
        <Text style={[styles.body, { color: palette.text, marginTop: 4 }]}>
          Visible to your trip leader from event start until midnight the following day.
        </Text>
      </Card>

      <SectionTitle>Leaving the club</SectionTitle>
      {LEAVING.map((opt) => (
        <Pressable key={opt.label}>
          <Card>
            <Text
              style={[
                styles.leavingLabel,
                { color: opt.tone === 'destructive' ? OtterPalette.ice : palette.text },
              ]}>
              {opt.label}
            </Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 20, fontWeight: '700' },
  fieldRow: { paddingVertical: 12 },
  fieldLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' },
  fieldValue: { fontSize: 14, marginTop: 2 },
  iceName: { fontSize: 15, fontWeight: '700' },
  iceMeta: { fontSize: 12, marginTop: 2 },
  addLink: { fontSize: 14, fontWeight: '700' },
  muted: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  body: { fontSize: 14 },
  leavingLabel: { fontSize: 14, fontWeight: '600' },
});
