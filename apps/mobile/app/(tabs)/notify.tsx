import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Card, Screen, SectionTitle, TopBar } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth';
import { type DiagStep, diagnosePushRegistration } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

type Category = { id: number; name: string };

export default function NotifyScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const { session } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [subscribed, setSubscribed] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diag, setDiag] = useState<DiagStep[] | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);

  const userId = session?.user.id ?? null;

  const runDiag = async () => {
    if (!userId) {
      return;
    }
    setDiagBusy(true);
    try {
      const steps = await diagnosePushRegistration(userId);
      setDiag(steps);
    } catch (e) {
      setDiag([{ step: 'fatal', ok: false, detail: String(e) }]);
    } finally {
      setDiagBusy(false);
    }
  };

  const load = useCallback(async () => {
    if (!userId) {
      return;
    }
    const [catRes, profileRes] = await Promise.all([
      supabase.from('event_categories').select('id, name').order('id'),
      supabase.from('profiles').select('notify_category_ids').eq('id', userId).maybeSingle(),
    ]);
    if (catRes.error) {
      setError(catRes.error.message);
      setLoading(false);
      return;
    }
    if (profileRes.error) {
      setError(profileRes.error.message);
      setLoading(false);
      return;
    }
    setCategories((catRes.data as Category[]) ?? []);
    setSubscribed(new Set(profileRes.data?.notify_category_ids ?? []));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (categoryId: number, on: boolean) => {
    if (!userId) {
      return;
    }
    const next = new Set(subscribed);
    if (on) {
      next.add(categoryId);
    } else {
      next.delete(categoryId);
    }
    setSubscribed(next);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ notify_category_ids: Array.from(next) })
      .eq('id', userId);
    if (updateError) {
      // Revert on failure
      setSubscribed(subscribed);
      setError(updateError.message);
    }
  };

  return (
    <Screen>
      <TopBar title="Notifications" subtitle="What you'd like to hear about" />

      <SectionTitle>Trip alerts</SectionTitle>
      <Card>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.tint} />
          </View>
        ) : (
          categories.map((c, i) => (
            <View
              key={c.id}
              style={[
                i < categories.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: palette.border,
                },
              ]}
            >
              <ToggleRow
                label={c.name}
                value={subscribed.has(c.id)}
                onValueChange={(on) => toggle(c.id, on)}
              />
            </View>
          ))
        )}
        {error ? (
          <Text style={[styles.caption, { color: OtterPalette.ice, marginTop: 8 }]}>{error}</Text>
        ) : null}
      </Card>

      <SectionTitle>Always on</SectionTitle>
      <Card>
        <Text style={[styles.caption, { color: palette.muted }]}>
          You'll always be notified about events you've signed up to: leader decisions, payment
          receipts, waitlist offers, and cancellations.
        </Text>
      </Card>

      <SectionTitle>Push diagnostics</SectionTitle>
      <Card>
        <Pressable
          onPress={diagBusy ? undefined : runDiag}
          disabled={diagBusy}
          style={[styles.diagBtn, { borderColor: palette.border, opacity: diagBusy ? 0.6 : 1 }]}
        >
          <Text style={[styles.diagBtnText, { color: palette.text }]}>
            {diagBusy ? 'Running…' : 'Run push check'}
          </Text>
        </Pressable>
        {diag ? (
          <View style={{ marginTop: 12, gap: 6 }}>
            {diag.map((s, i) => (
              <Text
                key={i}
                style={[styles.diagLine, { color: s.ok ? palette.text : OtterPalette.ice }]}
                selectable
              >
                {s.ok ? '✓' : '✗'} {s.step}: {s.detail}
              </Text>
            ))}
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (on: boolean) => void;
}) {
  const palette = Colors[useColorScheme() ?? 'light'];
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={[styles.toggleLabel, { color: palette.text }]}>{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: OtterPalette.slateNavy, false: '#d6d3cd' }}
        thumbColor="#ffffff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  caption: { fontSize: 12, marginTop: 2 },
  loading: { paddingVertical: 16, alignItems: 'center' },
  diagBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  diagBtnText: { fontSize: 14, fontWeight: '600' },
  diagLine: { fontSize: 12, fontFamily: 'monospace' },
});
