import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function Screen({ children }: { children: React.ReactNode }) {
  const palette = Colors[useColorScheme() ?? 'light'];
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.topBar}>
      <Text style={styles.wordmark}>OtterPool</Text>
      <Text style={styles.topBarTitle}>{title}</Text>
      {subtitle ? <Text style={styles.topBarSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  const palette = Colors[useColorScheme() ?? 'light'];
  return <Text style={[styles.sectionTitle, { color: palette.text }]}>{children}</Text>;
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = Colors[useColorScheme() ?? 'light'];
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
        style,
      ]}>
      {children}
    </View>
  );
}

export function GreyBox({
  height = 80,
  label,
  style,
}: {
  height?: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.greyBox, { height }, style]}>
      {label ? <Text style={styles.greyBoxLabel}>{label}</Text> : null}
    </View>
  );
}

export function Pill({
  label,
  color,
  style,
  textStyle,
}: {
  label: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: color ?? OtterPalette.slateNavy },
        style,
      ]}>
      <Text style={[styles.pillText, textStyle]}>{label}</Text>
    </View>
  );
}

export function Row({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Stat({ value, label }: { value: string; label: string }) {
  const palette = Colors[useColorScheme() ?? 'light'];
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: palette.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: palette.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: OtterPalette.slateNavy,
    marginBottom: 16,
  },
  wordmark: {
    fontSize: 13,
    color: '#ffffff',
    opacity: 0.7,
    letterSpacing: 0.5,
    marginBottom: 4,
    fontStyle: 'italic',
  },
  topBarTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
  },
  topBarSubtitle: {
    fontSize: 13,
    color: '#ffffff',
    opacity: 0.75,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginHorizontal: 20,
    marginTop: 18,
    marginBottom: 10,
    opacity: 0.6,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  greyBox: {
    backgroundColor: '#e3e1dc',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greyBoxLabel: {
    fontSize: 12,
    color: '#6b7178',
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  pillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
