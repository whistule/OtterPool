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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header } from '@/components/header';
import { PageTitle } from '@/components/page-title';
import { Card } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { roleFlags, useAuth } from '@/lib/auth';
import { today } from '@/lib/membership';
import { parseMemberPaste } from '@/lib/membership-import';
import { supabase } from '@/lib/supabase';

type ImportSummary = {
  added: number;
  updated: number;
  already_expired: number;
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
    // The parser has already normalised and de-duplicated the emails. RLS lets
    // only membership admins read and write the list.
    // ponytail: one page of existing emails (API max 1000 rows); page it if the list outgrows that.
    const { data: existing, error: readError } = await supabase
      .from('verified_members')
      .select('email_norm');
    if (readError) {
      setBusy(false);
      setError(readError.message);
      return;
    }
    const known = new Set((existing ?? []).map((r) => (r as { email_norm: string }).email_norm));
    const importedAt = new Date().toISOString();
    const { error: writeError } = await supabase.from('verified_members').upsert(
      parsed.rows.map((r) => ({
        email_norm: r.email,
        expires_on: r.expires,
        imported_at: importedAt,
      })),
      { onConflict: 'email_norm' },
    );
    setBusy(false);
    if (writeError) {
      setError(writeError.message);
      return;
    }
    const added = parsed.rows.filter((r) => !known.has(r.email)).length;
    const on = today();
    setSummary({
      added,
      updated: parsed.rows.length - added,
      already_expired: parsed.rows.filter((r) => r.expires !== null && r.expires < on).length,
    });
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
            is Active are imported. Emails already on the list are updated and anyone missing from
            this export keeps their last expiry date, so importing the same file twice is safe.
          </Text>
        </Card>

        {canPickFile ? (
          <>
            <Pressable
              accessibilityRole="button"
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
          accessibilityLabel="Membership list, one email and expiry date per line"
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
            <Text accessibilityRole="alert" style={[styles.body, { color: OtterPalette.ice }]}>
              {parsed.problem}
            </Text>
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
            <Text accessibilityRole="alert" style={[styles.body, { color: OtterPalette.ice }]}>
              {error}
            </Text>
          </Card>
        ) : null}

        {summary ? (
          <Card style={{ borderWidth: 1.5, borderColor: OtterPalette.forest }}>
            <Text style={[styles.summaryTitle, { color: OtterPalette.forest }]}>
              Import complete
            </Text>
            <Text style={[styles.body, { color: palette.text, marginTop: 6 }]}>
              {summary.added} new · {summary.updated} updated
              {summary.already_expired > 0
                ? ` (${summary.already_expired} already past their expiry)`
                : ''}
              .
            </Text>
          </Card>
        ) : null}

        <Pressable
          accessibilityRole="button"
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
