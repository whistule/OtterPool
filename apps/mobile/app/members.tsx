import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header } from '@/components/header';
import { EmptyCard, ErrorCard, LoadingCenter } from '@/components/screen-states';
import { PageTitle } from '@/components/page-title';
import { Card, Pill, Row } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoadOnFocus } from '@/hooks/use-load-on-focus';
import { roleFlags, useAuth } from '@/lib/auth';
import { emailKey, memberStatus } from '@/lib/membership';
import { LEVEL_EMOJI, LEVEL_LABEL, type ProgressionLevel } from '@/lib/progress';
import type { MemberStatus } from '@/lib/status';
import { supabase } from '@/lib/supabase';

type MemberRow = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  level: ProgressionLevel;
  status_override: MemberStatus | null;
  email?: string | null;
  status?: MemberStatus;
};

export default function MembersScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const { profile: viewerProfile } = useAuth();
  // Emails and membership status are membership-admin (and super-admin) data.
  const isAdmin = roleFlags(viewerProfile).membershipAdmin;
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, full_name, display_name, level, status_override')
      .order('full_name', { ascending: true });
    if (err) {
      setError(err.message);
    }
    const rows = (data as MemberRow[]) ?? [];

    // Admins additionally see each member's email and status (both gated
    // server-side: the email RPC and RLS on verified_members).
    if (isAdmin && rows.length > 0) {
      const [emailRes, listRes] = await Promise.all([
        supabase.rpc('admin_member_emails'),
        // ponytail: one page (API max 1000 rows); page it if the list outgrows that.
        supabase.from('verified_members').select('email_norm, expires_on'),
      ]);
      const emails = new Map(
        ((emailRes.data ?? []) as { id: string; email: string | null }[]).map((r) => [
          r.id,
          r.email,
        ]),
      );
      const listed = new Map(
        ((listRes.data ?? []) as { email_norm: string; expires_on: string | null }[]).map((r) => [
          r.email_norm,
          r,
        ]),
      );
      for (const row of rows) {
        row.email = emails.get(row.id) ?? null;
        row.status = memberStatus(row.status_override, listed.get(emailKey(row.email)) ?? null);
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
      <PageTitle title="Members" />
      <Header onBack={() => router.back()} title="Members" />
      <View style={[styles.searchWrap, { borderColor: palette.border }]}>
        <TextInput
          accessibilityLabel="Search members"
          value={query}
          onChangeText={setQuery}
          placeholder="Search members"
          placeholderTextColor={palette.muted}
          style={[styles.search, { color: palette.text }]}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      {isAdmin ? (
        <Pressable
          accessibilityRole="button"
          testID="members-import-link"
          onPress={() => router.push('/membership-import')}
          style={[styles.importBtn, { borderColor: OtterPalette.slateNavy }]}
        >
          <Text style={[styles.importBtnText, { color: OtterPalette.slateNavy }]}>
            ⬆ Import members from MemberMojo
          </Text>
        </Pressable>
      ) : null}
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
                accessibilityRole="button"
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
                      {m.status ? (
                        <Text style={[styles.muted, { color: palette.muted }]}>{m.status}</Text>
                      ) : null}
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
  importBtn: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  importBtnText: { fontSize: 14, fontWeight: '700' },
  search: { fontSize: 14 },
  name: { fontSize: 15, fontWeight: '700' },
  muted: { fontSize: 12, marginTop: 2 },
});
