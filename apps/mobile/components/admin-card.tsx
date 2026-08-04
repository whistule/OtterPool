import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Card } from '@/components/wireframe';
import { OtterPalette } from '@/constants/theme';

/** Shortcut into the members list. Rendered on Profile and Progress for admins. */
export function ManageMembersCard() {
  return (
    <Pressable onPress={() => router.push('/members')} testID="admin-manage-members">
      <Card style={styles.card}>
        <Text style={styles.kicker}>Admin</Text>
        <Text style={styles.action}>Manage members ›</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: OtterPalette.slateNavy, borderColor: OtterPalette.slateNavy },
  kicker: {
    color: '#ffffff',
    opacity: 0.7,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  action: { color: '#ffffff', fontSize: 16, fontWeight: '700', marginTop: 4 },
});
