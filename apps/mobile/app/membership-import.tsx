import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
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
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const parsed = useMemo(() => parseMemberPaste(paste), [paste]);

  const canPickFile = Platform.OS === 'web' && typeof document !== 'undefined';

  // Read the chosen CSV locally in the browser and feed its text through the
  // same parser as a paste. The file itself never leaves the device — only the
  // parsed {email, expires} rows are sent to Supabase on Import.
  const pickFile = () => {
    if (!canPickFile) {
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv,text/plain';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      const text = await file.text();
      setPaste(text);
      setSummary(null);
      setError(null);
      setFileName(file.name);
    };
    input.click();
  };

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
            Import the members export from MemberMojo — the whole CSV is fine (email, "Expires on"
            and "Membership state" columns are picked out automatically). Only members whose state
            is Active are imported. Importing replaces the whole list and re-checks everyone's
            membership.
          </Text>
        </Card>

        {canPickFile ? (
          <>
            <Pressable
              testID="membership-import-choose-file"
              onPress={pickFile}
              style={[styles.chooseBtn, { borderColor: OtterPalette.slateNavy }]}
            >
              <Text style={[styles.chooseBtnText, { color: OtterPalette.slateNavy }]}>
                ⬆ Choose CSV file…
              </Text>
            </Pressable>
            {fileName ? (
              <Text style={[styles.fileNote, { color: palette.muted }]}>
                Loaded {fileName} — check the count below, then Import.
              </Text>
            ) : (
              <Text style={[styles.fileNote, { color: palette.muted }]}>
                …or paste the list below.
              </Text>
            )}
          </>
        ) : null}

        <TextInput
          value={paste}
          onChangeText={(t) => {
            setPaste(t);
            setSummary(null);
            setFileName(null);
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

        {paste.trim() && parsed.problem ? (
          <Card style={{ borderWidth: 1.5, borderColor: OtterPalette.ice }}>
            <Text style={[styles.body, { color: OtterPalette.ice }]}>{parsed.problem}</Text>
          </Card>
        ) : null}

        {paste.trim() && !parsed.problem ? (
          <Card>
            <Text style={[styles.body, { color: palette.text }]}>
              {parsed.rows.length} active member{parsed.rows.length === 1 ? '' : 's'} detected
              {parsed.skippedInactive > 0
                ? ` · ${parsed.skippedInactive} skipped (not active)`
                : ''}
              {parsed.noDate > 0 ? ` · ${parsed.noDate} with no readable expiry date` : ''}.
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
  chooseBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  chooseBtnText: { fontSize: 15, fontWeight: '700' },
  fileNote: { fontSize: 12, textAlign: 'center' },
});
