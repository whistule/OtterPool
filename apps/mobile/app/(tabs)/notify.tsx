import React, { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { Card, Screen, SectionTitle, TopBar } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const TRIP_TYPES = [
  { label: 'Sea A trips', defaultOn: true },
  { label: 'Sea B trips', defaultOn: true },
  { label: 'Sea C trips', defaultOn: false },
  { label: 'River — up to G2', defaultOn: true },
  { label: 'River — G2/3 and above', defaultOn: false },
  { label: 'Pinkston sessions', defaultOn: true },
  { label: 'Tuesday Evenings', defaultOn: true },
  { label: 'Skills / Microsessions', defaultOn: false },
];

function ToggleRow({
  label,
  initial,
  caption,
}: {
  label: string;
  initial?: boolean;
  caption?: string;
}) {
  const palette = Colors[useColorScheme() ?? 'light'];
  const [on, setOn] = useState(initial ?? false);
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={[styles.toggleLabel, { color: palette.text }]}>{label}</Text>
        {caption ? <Text style={[styles.caption, { color: palette.muted }]}>{caption}</Text> : null}
      </View>
      <Switch
        value={on}
        onValueChange={setOn}
        trackColor={{ true: OtterPalette.slateNavy, false: '#d6d3cd' }}
        thumbColor="#ffffff"
      />
    </View>
  );
}

export default function NotifyScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];

  return (
    <Screen>
      <TopBar title="Notifications" subtitle="What you'd like to hear about" />

      <SectionTitle>Trip alerts</SectionTitle>
      <Card>
        {TRIP_TYPES.map((t, i) => (
          <View
            key={t.label}
            style={[
              i < TRIP_TYPES.length - 1 && {
                borderBottomWidth: 1,
                borderBottomColor: palette.border,
              },
            ]}
          >
            <ToggleRow label={t.label} initial={t.defaultOn} />
          </View>
        ))}
      </Card>

      <SectionTitle>Always on</SectionTitle>
      <Card>
        <Text style={[styles.caption, { color: palette.muted }]}>
          You'll always be notified about leader changes, change-of-plan updates, waitlist offers,
          and approval decisions.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  caption: { fontSize: 12, marginTop: 2 },
});
