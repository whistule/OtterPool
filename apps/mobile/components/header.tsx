import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { OtterPalette } from '@/constants/theme';

export function Header({
  onBack,
  title,
  right,
  backTestID,
}: {
  onBack: () => void;
  title?: string;
  right?: React.ReactNode;
  backTestID?: string;
}) {
  return (
    <View style={styles.header}>
      <Pressable testID={backTestID} onPress={onBack} style={styles.backBtn}>
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>
      {right ? (
        <View style={styles.rightWrap}>{right}</View>
      ) : title ? (
        <Text style={styles.title}>{title}</Text>
      ) : (
        <Text style={styles.wordmark}>OtterPool</Text>
      )}
      {right ? null : <View style={styles.backBtn} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: OtterPalette.slateNavy,
  },
  backBtn: { paddingHorizontal: 8, paddingVertical: 4, minWidth: 56 },
  backText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  wordmark: { color: '#fff', fontSize: 14, fontStyle: 'italic', opacity: 0.85 },
  rightWrap: { flex: 1, alignItems: 'flex-end' },
});
