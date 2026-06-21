import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header } from '@/components/header';
import { EmptyCard, ErrorCard, LoadingCenter } from '@/components/screen-states';
import { Card, Pill, Row } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoadOnFocus } from '@/hooks/use-load-on-focus';
import { useAuth } from '@/lib/auth';
import { LEVEL_EMOJI, LEVEL_LABEL, ProgressionLevel } from '@/lib/progress';
import { supabase } from '@/lib/supabase';

type MemberRow = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  level: ProgressionLevel;
  status: 'active' | 'aspirant' | 'lapsed' | 'suspended';
  email?: string | null;
};

export default function MembersScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const { profile: viewerProfile } = useAuth();
  const isAdmin = !!viewerProfile?.is_admin;
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, full_name, display_name, level, status')
      .order('full_name', { ascending: true });
    if (err) {
      setError(err.message);
    }
    const rows = (data as MemberRow[]) ?? [];

    // Admins additionally see each member's email (gated server-side).
    if (isAdmin && rows.length > 0) {
      const { data: emailData } = await supabase.rpc('admin_member_emails');
      if (emailData) {
        const byId = new Map(
          (emailData as { id: string; email: string | null }[]).map((r) => [r.id, r.email]),
        );
        for (const row of rows) {
          row.email = byId.get(row.id) ?? null;
        }
      }
    }
    setMembers(rows);
  }, [isAdmin]);

  useLoadOnFocus(load);

  const filtered = (members ?? []).filter((m) => {
    if (!query) {
      return true;
    }
    const q = query.toLowerCase();
    return (
      (m.full_name ?? '').toLowerCase().includes(q) ||
      (m.display_name ?? '').toLowerCase().includes(q) ||
      (m.email ?? '').toLowerCase().includes(q)
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
          <LoadingCenter />
        ) : error ? (
          <ErrorCard title="Couldn't load members" message={error} />
        ) : filtered.length === 0 ? (
          <EmptyCard message={query ? 'No matches' : 'No members'} />
        ) : (
          filtered.map((m) => {
            const name = m.display_name ?? m.full_name ?? 'Member';
            return (
              <Pressable
                key={m.id}
                onPress={() => router.push(`/profile/${m.id}`)}
                testID={`member-row-${m.id}`}
              >
                <Card>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={[styles.name, { color: palette.text }]}>{name}</Text>
                      {m.email ? (
                        <Text style={[styles.muted, { color: palette.muted }]}>{m.email}</Text>
                      ) : null}
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
});
