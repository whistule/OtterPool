import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// A wizard progress bar ported from the create-event prototype: numbered
// circles + tiny uppercase labels joined by lines, coloured by state
// (done = filled forest, active = forest ring, future = grey). Tap to jump.
export function StepProgress({
  steps,
  current,
  onJump,
}: {
  steps: string[];
  current: number;
  onJump: (step: number) => void;
}) {
  const palette = Colors[useColorScheme() ?? 'light'];

  return (
    <View
      style={[
        styles.bar,
        { borderBottomColor: palette.border, backgroundColor: palette.background },
      ]}
    >
      {steps.map((label, i) => {
        const num = i + 1;
        const done = num < current;
        const active = num === current;
        return (
          <View key={label} style={styles.segment}>
            {i > 0 ? (
              <View
                style={[
                  styles.line,
                  { backgroundColor: num <= current ? OtterPalette.forest : palette.border },
                ]}
              />
            ) : null}
            <Pressable style={styles.step} onPress={() => onJump(num)}>
              <View
                style={[
                  styles.circle,
                  {
                    borderColor: done || active ? OtterPalette.forest : palette.border,
                    backgroundColor: done ? OtterPalette.forest : palette.background,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.circleText,
                    { color: done ? '#fff' : active ? OtterPalette.forest : palette.muted },
                  ]}
                >
                  {done ? '✓' : num}
                </Text>
              </View>
              <Text
                style={[
                  styles.label,
                  { color: active || done ? OtterPalette.forest : palette.muted },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  segment: { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  line: { flex: 1, height: 2, marginTop: 13 },
  step: { alignItems: 'center', gap: 4 },
  circle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleText: { fontSize: 12, fontWeight: '600' },
  label: { fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: '600' },
});
