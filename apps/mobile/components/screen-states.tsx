import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function LoadingCenter() {
  const palette = Colors[useColorScheme() ?? 'light'];
  return (
    <View style={styles.center}>
      <ActivityIndicator color={palette.tint} />
    </View>
  );
}

export function ErrorCard({
  title,
  message,
}: {
  title: string;
  message?: string | null;
}) {
  const palette = Colors[useColorScheme() ?? 'light'];
  return (
    <Card>
      <Text style={[styles.errTitle, { color: OtterPalette.ice }]}>{title}</Text>
      {message ? <Text style={[styles.muted, { color: palette.muted }]}>{message}</Text> : null}
    </Card>
  );
}

export function EmptyCard({ message }: { message: string }) {
  const palette = Colors[useColorScheme() ?? 'light'];
  return (
    <Card>
      <Text style={[styles.empty, { color: palette.muted }]}>{message}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { padding: 32, alignItems: 'center' },
  errTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  muted: { fontSize: 12 },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },
});
