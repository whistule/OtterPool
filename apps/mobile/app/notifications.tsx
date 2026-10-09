import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Header } from '@/components/header';
import { PageTitle } from '@/components/page-title';
import { Card, Screen, SectionTitle } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth';
import { gradeOptionsFor } from '@/lib/event-form-utils';
import { type DiagStep, diagnosePushRegistration } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

type Category = { id: number; name: string };
// Category id (as text) → the grades picked within it. Missing or empty means
// every grade. Read by the notify-event-created function.
type GradeFilters = Record<string, string[]>;

export default function NotifyScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const { session } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [subscribed, setSubscribed] = useState<Set<number>>(new Set());
  const [gradeFilters, setGradeFilters] = useState<GradeFilters>({});
  // Graded categories open to show their grade switches; all start closed.
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
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
      const steps = await diagnosePushRegistration();
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
      supabase
        .from('profiles')
        .select('notify_category_ids, notify_grade_filters')
        .eq('id', userId)
        .maybeSingle(),
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
    setGradeFilters((profileRes.data?.notify_grade_filters as GradeFilters | null) ?? {});
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

  const saveGradeFilters = async (next: GradeFilters) => {
    if (!userId) {
      return;
    }
    setGradeFilters(next);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ notify_grade_filters: next })
      .eq('id', userId);
    if (updateError) {
      setGradeFilters(gradeFilters);
      setError(updateError.message);
    }
  };

  // The category's own switch means "every grade" either way, so it clears
  // any grade picks left over from before.
  const toggleCategory = async (categoryId: number, on: boolean) => {
    const key = String(categoryId);
    if (gradeFilters[key]) {
      const next = { ...gradeFilters };
      delete next[key];
      saveGradeFilters(next);
    }
    await toggle(categoryId, on);
  };

  // No filter stored = every grade on. Switching some off stores the ones
  // still on; switching them all back on clears the filter. Switching a grade
  // on in a category that's off turns the category on for just that grade,
  // and switching the last grade off turns the category off.
  const toggleGrade = async (
    categoryId: number,
    allGrades: readonly string[],
    grade: string,
    on: boolean,
  ) => {
    const key = String(categoryId);
    const isOn = subscribed.has(categoryId);
    const current = !isOn ? [] : gradeFilters[key]?.length ? gradeFilters[key] : allGrades;
    const picked = on
      ? allGrades.filter((g) => g === grade || current.includes(g))
      : current.filter((g) => g !== grade);
    const next = { ...gradeFilters };
    if (picked.length > 0 && picked.length < allGrades.length) {
      next[key] = picked;
    } else {
      delete next[key];
    }
    saveGradeFilters(next);
    if (picked.length === 0 && isOn) {
      await toggle(categoryId, false);
    } else if (picked.length > 0 && !isOn) {
      await toggle(categoryId, true);
    }
  };

  const toggleExpanded = (categoryId: number) => {
    const next = new Set(expanded);
    if (next.has(categoryId)) {
      next.delete(categoryId);
    } else {
      next.add(categoryId);
    }
    setExpanded(next);
  };

  return (
    <Screen>
      <PageTitle title="Notifications" />
      <Header
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        title="Notifications"
      />

      <SectionTitle>Trip alerts</SectionTitle>
      <Card>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.tint} />
          </View>
        ) : (
          categories.map((c, i) => {
            const grades = gradeOptionsFor(c);
            const on = subscribed.has(c.id);
            const picked = gradeFilters[String(c.id)] ?? [];
            const open = expanded.has(c.id);
            return (
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
                  desc={grades ? gradeSummary(on, picked, grades) : undefined}
                  value={on}
                  onValueChange={(v) => (grades ? toggleCategory(c.id, v) : toggle(c.id, v))}
                  expanded={grades ? open : undefined}
                  onToggleExpand={grades ? () => toggleExpanded(c.id) : undefined}
                  testID={`notify-category-${c.id}`}
                />
                {grades && open ? (
                  <GradePicker
                    categoryId={c.id}
                    grades={grades}
                    on={on}
                    picked={picked}
                    onToggle={(g, v) => toggleGrade(c.id, grades, g, v)}
                  />
                ) : null}
              </View>
            );
          })
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
          accessibilityRole="button"
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
                // biome-ignore lint/suspicious/noArrayIndexKey: read-only diagnostic lines, never reordered
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

// What's under a collapsed graded category, so you needn't open it to check.
function gradeSummary(on: boolean, picked: string[], grades: readonly string[]): string {
  if (!on) {
    return 'Off';
  }
  if (picked.length === 0) {
    return 'All grades';
  }
  if (picked.length <= 3) {
    return picked.join(', ');
  }
  return `${picked.length} of ${grades.length} grades`;
}

// With `onToggleExpand`, tapping the label opens and closes the row's grades;
// the switch on the right still turns the whole category on or off.
function ToggleRow({
  label,
  desc,
  value,
  onValueChange,
  expanded,
  onToggleExpand,
  testID,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onValueChange: (on: boolean) => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
  testID?: string;
}) {
  const palette = Colors[useColorScheme() ?? 'light'];
  const text = (
    <>
      <Text style={[styles.toggleLabel, { color: palette.text }]}>{label}</Text>
      {desc ? <Text style={[styles.caption, { color: palette.muted }]}>{desc}</Text> : null}
    </>
  );
  return (
    <View style={styles.toggleRow}>
      {onToggleExpand ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${label} grades`}
          onPress={onToggleExpand}
          testID={testID ? `${testID}-expand` : undefined}
          style={styles.expandArea}
        >
          <View style={styles.labelWithChevron}>
            <Text style={[styles.toggleLabel, { color: palette.text }]}>{label}</Text>
            <Text
              style={[
                styles.chevron,
                { color: palette.muted, transform: [{ rotate: expanded ? '90deg' : '0deg' }] },
              ]}
            >
              ›
            </Text>
          </View>
          <Text style={[styles.caption, { color: palette.muted }]}>
            {desc}
            {expanded ? null : (
              <Text style={{ color: palette.link }}>{desc ? ' ' : ''}(tap to choose grades)</Text>
            )}
          </Text>
        </Pressable>
      ) : (
        <View style={{ flex: 1, paddingRight: 12 }}>{text}</View>
      )}
      <Switch
        testID={testID}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: OtterPalette.slateNavy, false: '#d6d3cd' }}
        thumbColor="#ffffff"
      />
    </View>
  );
}

// Same wording as the prototype's notification settings.
const GRADE_DESC: Record<string, string> = {
  'Sea A': 'Sheltered coastal paddles',
  'Sea B': 'Moderate open crossings',
  'Sea C': 'Exposed coastline & expeditions',
};

// A switch per grade, indented under an opened category. With the category
// on, nothing stored (`picked` empty) means every grade is on.
function GradePicker({
  categoryId,
  grades,
  on,
  picked,
  onToggle,
}: {
  categoryId: number;
  grades: readonly string[];
  on: boolean;
  picked: string[];
  onToggle: (grade: string, on: boolean) => void;
}) {
  const palette = Colors[useColorScheme() ?? 'light'];
  return (
    <View style={[styles.gradePicker, { borderLeftColor: palette.border }]}>
      {grades.map((g) => (
        <ToggleRow
          key={g}
          label={g}
          desc={GRADE_DESC[g]}
          value={on && (picked.length === 0 || picked.includes(g))}
          onValueChange={(v) => onToggle(g, v)}
          testID={`notify-grade-${categoryId}-${g}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  gradePicker: { marginLeft: 4, paddingLeft: 14, borderLeftWidth: 2, marginBottom: 12 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  expandArea: { flex: 1, paddingRight: 12 },
  labelWithChevron: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chevron: { fontSize: 26, lineHeight: 26, width: 18, textAlign: 'center' },
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
