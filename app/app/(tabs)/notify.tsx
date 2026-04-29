import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Card, Row, Screen, SectionTitle, TopBar } from '@/components/wireframe';
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

const REMINDERS = ['1 month before', '1 week before', 'Day before', '1 hour before'];

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
  const [activeReminders, setActiveReminders] = useState<string[]>(['1 week before', 'Day before']);

  const toggleReminder = (r: string) =>
    setActiveReminders((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );

  return (
    <Screen>
      <TopBar title="Notifications" subtitle="What you'd like to hear about" />

      <SectionTitle>Trip alerts</SectionTitle>
      <Card>
        {TRIP_TYPES.map((t, i) => (
          <View
            key={t.label}
            style={[
              i < TRIP_TYPES.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.border },
            ]}>
            <ToggleRow label={t.label} initial={t.defaultOn} />
          </View>
        ))}
      </Card>

      <SectionTitle>Event reminders</SectionTitle>
      <Card>
        <Text style={[styles.caption, { color: palette.muted, marginBottom: 10 }]}>
          When to remind you about confirmed trips
        </Text>
        <Row style={{ flexWrap: 'wrap', gap: 8 }}>
          {REMINDERS.map((r) => {
            const isOn = activeReminders.includes(r);
            return (
              <Pressable
                key={r}
                onPress={() => toggleReminder(r)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isOn ? OtterPalette.slateNavy : palette.surface,
                    borderColor: isOn ? OtterPalette.slateNavy : palette.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.chipText,
                    { color: isOn ? '#ffffff' : palette.text },
                  ]}>
                  {r}
                </Text>
              </Pressable>
            );
          })}
        </Row>
      </Card>

      <SectionTitle>Messages</SectionTitle>
      <Card>
        <ToggleRow label="Group thread messages" initial={true} caption="Push for each new message" />
        <View style={{ borderBottomWidth: 1, borderBottomColor: palette.border }} />
        <ToggleRow label="Daily digest only" initial={false} caption="One push per day at 7pm" />
      </Card>

      <SectionTitle>Always on</SectionTitle>
      <Card>
        <Text style={[styles.caption, { color: palette.muted }]}>
          You'll always be notified about leader changes, change-of-plan updates,
          waitlist offers, and approval decisions.
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
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
});
