import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Pill, Row } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { LEVEL_EMOJI, LEVEL_LABEL, ProgressionLevel } from '@/lib/progress';
import { supabase } from '@/lib/supabase';

type MemberRow = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  level: ProgressionLevel;
  status: 'active' | 'aspirant' | 'lapsed' | 'suspended';
};

export default function MembersScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, full_name, display_name, level, status')
      .order('full_name', { ascending: true });
    if (err) setError(err.message);
    setMembers((data as MemberRow[]) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = (members ?? []).filter((m) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      (m.full_name ?? '').toLowerCase().includes(q) ||
      (m.display_name ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
      <Header onBack={() => router.back()} title="Members" />
      <View style={[styles.searchWrap, { borderColor: palette.border }]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search members"
          placeholderTextColor={palette.muted}
          style={[styles.search, { color: palette.text }]}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {members == null ? (
          <View style={styles.center}>
            <ActivityIndicator color={palette.tint} />
          </View>
        ) : error ? (
          <Card>
            <Text style={[styles.errTitle, { color: OtterPalette.ice }]}>
              Couldn&apos;t load members
            </Text>
            <Text style={[styles.muted, { color: palette.muted }]}>{error}</Text>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <Text style={[styles.muted, { color: palette.muted, textAlign: 'center' }]}>
              {query ? 'No matches' : 'No members'}
            </Text>
          </Card>
        ) : (
          filtered.map((m) => {
            const name = m.display_name ?? m.full_name ?? 'Member';
            return (
              <Pressable
                key={m.id}
                onPress={() => router.push(`/profile/${m.id}`)}
                testID={`member-row-${m.id}`}>
                <Card>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={[styles.name, { color: palette.text }]}>{name}</Text>
                      <Text style={[styles.muted, { color: palette.muted }]}>{m.status}</Text>
                    </View>
                    <Pill
                      label={`${LEVEL_EMOJI[m.level]} ${LEVEL_LABEL[m.level]}`}
                      color={OtterPalette.slateNavy}
                    />
                  </Row>
                </Card>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={[styles.header, { backgroundColor: OtterPalette.slateNavy }]}>
      <Pressable onPress={onBack} style={styles.backBtn}>
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.backBtn} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { padding: 32, alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backBtn: { paddingHorizontal: 8, paddingVertical: 4, minWidth: 56 },
  backText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  searchWrap: {
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#ffffff',
  },
  search: { fontSize: 14 },
  name: { fontSize: 15, fontWeight: '700' },
  muted: { fontSize: 12, marginTop: 2 },
  errTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
});
