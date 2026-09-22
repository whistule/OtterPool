import { router } from 'expo-router';
import { useMemo, useState } from 'react';
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

import { Header } from '@/components/header';
import { PageTitle } from '@/components/page-title';
import { Card } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { roleFlags, useAuth } from '@/lib/auth';
import { parseMemberPaste } from '@/lib/membership-import';
import { supabase } from '@/lib/supabase';

type ImportSummary = {
  imported: number;
  already_expired: number;
  activated: number;
  restamped: number;
  lapsed: number;
};

export default function MembershipImportScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const { profile } = useAuth();
  const isMembershipAdmin = roleFlags(profile).membershipAdmin;

  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const parsed = useMemo(() => parseMemberPaste(paste), [paste]);

  if (!isMembershipAdmin) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: palette.background }]}
        edges={['top']}
      >
        <Header onBack={() => router.back()} title="Import members" />
        <Card style={{ marginTop: 16 }}>
          <Text style={[styles.errTitle, { color: OtterPalette.ice }]}>
            Membership admins only.
          </Text>
        </Card>
      </SafeAreaView>
    );
  }

  const runImport = async () => {
    if (parsed.rows.length === 0) {
      return;
    }
    setBusy(true);
    setError(null);
    setSummary(null);
    const { data, error: rpcError } = await supabase.rpc('import_verified_members', {
      p_rows: parsed.rows.map((r) => ({ email: r.email, expires: r.expires })),
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setSummary(data as ImportSummary);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
      <PageTitle title="Import members" />
      <Header onBack={() => router.back()} title="Import members" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <Card>
          <Text style={[styles.body, { color: palette.text }]}>
            Paste the member list copied from MemberMojo — one member per line, each with their
            email and renewal/expiry date (tab- or comma-separated). Importing replaces the whole
            list and re-checks everyone's membership.
          </Text>
        </Card>

        <TextInput
          value={paste}
          onChangeText={(t) => {
            setPaste(t);
            setSummary(null);
          }}
          placeholder={'alice@example.com\t30/09/2027\nbob@example.com\t30/09/2027'}
          placeholderTextColor={palette.muted}
          multiline
          textAlignVertical="top"
          style={[
            styles.paste,
            { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
          ]}
        />

        {paste.trim() ? (
          <Card>
            <Text style={[styles.body, { color: palette.text }]}>
              {parsed.rows.length} member{parsed.rows.length === 1 ? '' : 's'} detected
              {parsed.noDate > 0
                ? ` · ${parsed.noDate} with no readable date (they'll have no expiry)`
                : ' · all with an expiry date'}
              .
            </Text>
          </Card>
        ) : null}

        {error ? (
          <Card style={{ borderWidth: 1.5, borderColor: OtterPalette.ice }}>
            <Text style={[styles.body, { color: OtterPalette.ice }]}>{error}</Text>
          </Card>
        ) : null}

        {summary ? (
          <Card style={{ borderWidth: 1.5, borderColor: OtterPalette.forest }}>
            <Text style={[styles.summaryTitle, { color: OtterPalette.forest }]}>
              Import complete
            </Text>
            <Text style={[styles.body, { color: palette.text, marginTop: 6 }]}>
              {summary.imported} email{summary.imported === 1 ? '' : 's'} on the list
              {summary.already_expired > 0
                ? ` (${summary.already_expired} already past their expiry)`
                : ''}
              .
            </Text>
            <Text style={[styles.body, { color: palette.muted, marginTop: 6 }]}>
              {summary.activated} activated · {summary.restamped} re-linked · {summary.lapsed}{' '}
              lapsed
            </Text>
          </Card>
        ) : null}

        <Pressable
          testID="membership-import-run"
          onPress={busy || parsed.rows.length === 0 ? undefined : runImport}
          disabled={busy || parsed.rows.length === 0}
          style={[
            styles.primaryBtn,
            {
              backgroundColor: parsed.rows.length === 0 ? '#9aa3ac' : OtterPalette.slateNavy,
              opacity: busy ? 0.7 : 1,
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {parsed.rows.length === 0
                ? 'Paste a list to import'
                : `Import ${parsed.rows.length} member${parsed.rows.length === 1 ? '' : 's'}`}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { fontSize: 14, lineHeight: 20 },
  errTitle: { fontSize: 15, fontWeight: '700' },
  summaryTitle: { fontSize: 16, fontWeight: '700' },
  paste: {
    minHeight: 200,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    fontFamily: 'monospace',
  },
  primaryBtn: { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
