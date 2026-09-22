import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { OtterPalette } from '@/constants/theme';

export type DayCell = {
  key: string; // YYYY-MM-DD (local)
  weekday: string;
  day: number;
  count: number;
  color?: string; // discipline colour of the day's first event
  isToday: boolean;
};

// A horizontal fortnight strip (modelled on the prototype). Days with events
// show a small coloured pill; tapping a day filters the list to it (tapping
// the selected day again clears).
export function DateStrip({
  days,
  selected,
  onSelect,
  mutedColor,
  textColor,
  borderColor,
  background,
}: {
  days: DayCell[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  mutedColor: string;
  textColor: string;
  borderColor: string;
  background: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.bar, { borderBottomColor: borderColor, backgroundColor: background }]}
      contentContainerStyle={styles.content}
    >
      {days.map((d) => {
        const on = selected === d.key;
        return (
          <Pressable
            key={d.key}
            testID={`date-strip-${d.key}`}
            onPress={() => onSelect(on ? null : d.key)}
            style={[
              styles.cell,
              {
                backgroundColor: on ? OtterPalette.forest : 'transparent',
                borderColor: d.isToday && !on ? OtterPalette.forest : 'transparent',
              },
            ]}
          >
            <Text style={[styles.wd, { color: on ? 'rgba(255,255,255,0.8)' : mutedColor }]}>
              {d.weekday}
            </Text>
            <Text
              style={[
                styles.num,
                {
                  color: on ? '#fff' : d.isToday ? OtterPalette.forest : textColor,
                  fontWeight: d.isToday || on ? '800' : '600',
                },
              ]}
            >
              {d.day}
            </Text>
            <View style={styles.pipWrap}>
              {d.count > 0 ? (
                <View
                  style={[
                    styles.pip,
                    { backgroundColor: on ? '#fff' : (d.color ?? OtterPalette.slateNavy) },
                  ]}
                />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { flexGrow: 0, borderBottomWidth: 1 },
  content: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  cell: {
    width: 42,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  wd: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  num: { fontSize: 16, marginTop: 2 },
  pipWrap: { height: 8, justifyContent: 'center', marginTop: 3 },
  pip: { width: 16, height: 4, borderRadius: 2 },
});
