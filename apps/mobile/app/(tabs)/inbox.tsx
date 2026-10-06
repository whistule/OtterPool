import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PageTitle } from '@/components/page-title';
import { EmptyCard, ErrorCard, LoadingCenter } from '@/components/screen-states';
import { Card, Row, TopBar } from '@/components/wireframe';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoadOnFocus } from '@/hooks/use-load-on-focus';
import { type AttentionItem, loadAttention } from '@/lib/attention';
import { roleFlags, useAuth } from '@/lib/auth';

export default function InboxScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const { session, profile } = useAuth();
  const userId = session?.user.id ?? null;
  const paddlingAdmin = roleFlags(profile).paddlingAdmin;

  const [items, setItems] = useState<AttentionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setItems([]);
      return;
    }
    const res = await loadAttention(userId, paddlingAdmin);
    setItems(res.items);
    setError(res.error);
  }, [userId, paddlingAdmin]);

  const { refreshing, onRefresh } = useLoadOnFocus(load);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }} edges={['top']}>
      <PageTitle title="Inbox" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <TopBar title="Inbox" subtitle="Things that need you" />

        {items == null ? (
          <LoadingCenter />
        ) : error ? (
          <ErrorCard title="Couldn't load your inbox" message={error} />
        ) : items.length === 0 ? (
          <EmptyCard message="Nothing needs your attention." />
        ) : (
          items.map((item) => (
            <Pressable
              accessibilityRole="button"
              key={item.key}
              onPress={() => router.push(item.href)}
              testID={`inbox-${item.key}`}
            >
              <Card>
                <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.title, { color: palette.text }]}>{item.title}</Text>
                    <Text style={[styles.detail, { color: palette.muted }]}>{item.detail}</Text>
                  </View>
                  <Text aria-hidden style={[styles.title, { color: palette.muted }]}>
                    ›
                  </Text>
                </Row>
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  detail: { fontSize: 12 },
});
