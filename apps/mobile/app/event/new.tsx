import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Image } from 'expo-image';
import type * as ImagePicker from 'expo-image-picker';
import { v4 as uuidv4 } from 'uuid';
import { Card, Row, SectionTitle } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth';
import { pickImage, uploadPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';

type Category = {
  id: number;
  name: string;
  default_min_level: 'frog' | 'duck' | 'otter' | 'dolphin' | 'selkie';
  default_cost: number;
};

type FieldKey =
  | 'title'
  | 'category'
  | 'startsAt'
  | 'duration'
  | 'maxParticipants'
  | 'cost'
  | 'repeatCount';

const LEVELS: Array<'frog' | 'duck' | 'otter' | 'dolphin'> = [
  'frog',
  'duck',
  'otter',
  'dolphin',
];

const LEVEL_EMOJI: Record<string, string> = {
  frog: '🐸',
  duck: '🦆',
  otter: '🦦',
  dolphin: '🐬',
};

const CATEGORY_TITLE_HINTS: Record<string, string> = {
  'Tuesday Evening - Loch Lomond': 'Tuesday Evening — Balmaha',
  'Tuesday Evening - All Away': 'Tuesday Away — Loch Tay',
  'Night Paddle': 'Night Paddle — Bardowie',
  Pinkston: 'Pinkston · pump session',
  'Pool / Loch Sessions': 'Pool session — Bellahouston',
  'River Trip': 'River Tay — Grandtully',
  'Sea Kayak': 'Sea Kayak — Cumbrae circumnavigation',
  'Second Saturday Paddle': 'Second Saturday — Loch Lomond',
  'Skills Sessions / MicroSessions': 'Skills — rolling clinic',
  'Training / Qualifications': 'Training — leader assessment',
};

const CATEGORY_DEFAULTS: Record<
  string,
  { repeats?: { enabled: boolean; frequency: 'weekly' | 'fortnightly' }; location?: string }
> = {
  'Tuesday Evening - Loch Lomond': {
    repeats: { enabled: true, frequency: 'weekly' },
    location: 'Loch Lomond, Balmaha',
  },
  'Tuesday Evening - All Away': { repeats: { enabled: true, frequency: 'weekly' } },
  Pinkston: { location: 'Pinkston Watersports Centre, Glasgow' },
};

const SEA_GRADES = ['Sea A', 'Sea B', 'Sea C'] as const;
const PINKSTON_GRADES = ['P1', 'P2', 'P3'] as const;
const RIVER_GRADES = [
  'G1',
  'G1/2',
  'G2',
  'G2/3',
  'G3',
  'G3(4)',
  'G4',
  'G4(5)',
  'G4/5',
  'G5',
] as const;

function gradeOptionsFor(category: Category | null): readonly string[] | null {
  if (!category) return null;
  if (category.name === 'Sea Kayak') return SEA_GRADES;
  if (category.name === 'Pinkston') return PINKSTON_GRADES;
  if (category.name === 'River Trip') return RIVER_GRADES;
  return null;
}

type CategoryGroup = {
  label: string;
  items: Array<{ category: Category; label: string }>;
};

function groupCategories(categories: Category[]): CategoryGroup[] {
  const groups: Record<string, CategoryGroup> = {};
  const order: string[] = [];

  const place = (key: string, c: Category, chipLabel: string) => {
    if (!groups[key]) {
      groups[key] = { label: key, items: [] };
      order.push(key);
    }
    groups[key].items.push({ category: c, label: chipLabel });
  };

  for (const c of categories) {
    if (c.name === 'Sea Kayak') {
      place('Open water', c, 'Sea Kayak');
    } else if (c.name === 'River Trip') {
      place('Open water', c, 'River');
    } else if (c.name === 'Pinkston') {
      place('Pump track', c, 'Pinkston');
    } else if (c.name.startsWith('Tuesday Evening')) {
      const variant = c.name.replace('Tuesday Evening - ', '');
      place('Tuesday evening', c, variant);
    } else if (
      c.name === 'Pool / Loch Sessions' ||
      c.name === 'Night Paddle' ||
      c.name === 'Second Saturday Paddle'
    ) {
      place('Loch / pool', c, c.name);
    } else if (c.name.startsWith('Skills') || c.name.startsWith('Training')) {
      place('Skills & training', c, c.name);
    } else {
      place('Other', c, c.name);
    }
  }

  return order.map((k) => groups[k]);
}

function defaultStartIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(18, 30, 0, 0);
  return toLocalIsoMinutes(d);
}

function toLocalIsoMinutes(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatPreviewDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NewEventScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const { session, profile } = useAuth();
  const { width } = useWindowDimensions();
  const wideLayout = width >= 600;

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [grade, setGrade] = useState('');
  const [startsAt, setStartsAt] = useState(defaultStartIso());
  const [durationHours, setDurationHours] = useState('2');
  const [location, setLocation] = useState('');
  const [meetingPoint, setMeetingPoint] = useState('');
  const [minLevel, setMinLevel] = useState<'frog' | 'duck' | 'otter' | 'dolphin'>('frog');
  const [minLevelTouched, setMinLevelTouched] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState('12');
  const [cost, setCost] = useState('0');
  const [approvalMode, setApprovalMode] = useState<'auto' | 'manual_all'>('auto');
  const [description, setDescription] = useState('');
  const [photoAsset, setPhotoAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState<'weekly' | 'fortnightly'>('weekly');
  const [repeatCount, setRepeatCount] = useState('4');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    supabase
      .from('event_categories')
      .select('id, name, default_min_level, default_cost')
      .order('id')
      .then(({ data, error: fetchErr }) => {
        if (cancelled) return;
        if (fetchErr) {
          setError(`Couldn't load categories: ${fetchErr.message}`);
          return;
        }
        setCategories((data ?? []) as Category[]);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId]
  );

  const titlePlaceholder = useMemo(() => {
    const hint = selectedCategory ? CATEGORY_TITLE_HINTS[selectedCategory.name] : null;
    return hint ?? 'e.g. Sea Kayak — Cumbrae circumnavigation';
  }, [selectedCategory]);

  const occurrencePreview = useMemo(() => {
    if (!repeatEnabled) return [];
    const n = Number(repeatCount);
    if (!Number.isInteger(n) || n < 2 || n > 26) return [];
    const start = new Date(startsAt);
    if (isNaN(start.getTime())) return [];
    const stepDays = repeatFrequency === 'fortnightly' ? 14 : 7;
    return Array.from({ length: Math.min(n, 6) }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i * stepDays);
      return d;
    });
  }, [repeatEnabled, repeatCount, repeatFrequency, startsAt]);

  const onPickCategory = (c: Category) => {
    setCategoryId(c.id);
    setFieldErrors((e) => ({ ...e, category: undefined }));
    if (!minLevelTouched) {
      setMinLevel(c.default_min_level === 'selkie' ? 'dolphin' : c.default_min_level);
    }
    setCost(String(c.default_cost ?? 0));
    // Clear any grade from a previous category — picker options may differ.
    const opts = gradeOptionsFor(c);
    if (!opts || !opts.includes(grade as never)) setGrade('');
    const defaults = CATEGORY_DEFAULTS[c.name];
    if (defaults?.repeats && !repeatEnabled) {
      setRepeatEnabled(defaults.repeats.enabled);
      setRepeatFrequency(defaults.repeats.frequency);
    }
    if (defaults?.location && !location.trim()) {
      setLocation(defaults.location);
    }
  };

  const submit = async () => {
    if (!session) return;
    setError(null);
    const errs: Partial<Record<FieldKey, string>> = {};
    if (!title.trim()) errs.title = 'Title is required';
    if (!categoryId) errs.category = 'Pick a category';

    const startDate = new Date(startsAt);
    if (isNaN(startDate.getTime())) errs.startsAt = 'Invalid date — use YYYY-MM-DDTHH:MM';

    const dur = Number(durationHours);
    if (durationHours.trim() && (isNaN(dur) || dur < 0)) {
      errs.duration = 'Duration must be a non-negative number';
    }
    const endDate =
      dur > 0 && !isNaN(dur) ? new Date(startDate.getTime() + dur * 60 * 60 * 1000) : null;

    const maxP = maxParticipants.trim() ? Number(maxParticipants) : null;
    if (maxP !== null && (isNaN(maxP) || maxP < 1)) {
      errs.maxParticipants = 'Must be a positive whole number, or blank';
    }
    const costNum = Number(cost);
    if (isNaN(costNum) || costNum < 0) {
      errs.cost = 'Cost must be 0 or a positive number';
    }

    let occurrences = 1;
    let seriesId: string | null = null;
    if (repeatEnabled) {
      const n = Number(repeatCount);
      if (!Number.isInteger(n) || n < 2 || n > 26) {
        errs.repeatCount = 'Whole number between 2 and 26';
      } else {
        occurrences = n;
        seriesId = uuidv4();
      }
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setError('Some fields need attention — see highlighted rows.');
      return;
    }
    setFieldErrors({});

    const stepDays = repeatFrequency === 'fortnightly' ? 14 : 7;
    const baseRow = {
      title: title.trim(),
      category_id: categoryId,
      description: description.trim() || null,
      grade_advertised: grade.trim() || null,
      location: location.trim() || null,
      meeting_point: meetingPoint.trim() || null,
      min_level: minLevel,
      max_participants: maxP,
      cost: costNum,
      approval_mode: approvalMode,
      status: 'open' as const,
      leader_id: session.user.id,
      series_id: seriesId,
    };

    const rows = Array.from({ length: occurrences }, (_, i) => {
      const occStart = new Date(startDate.getTime());
      occStart.setDate(occStart.getDate() + i * stepDays);
      const occEnd = endDate
        ? new Date(occStart.getTime() + (endDate.getTime() - startDate.getTime()))
        : null;
      return {
        ...baseRow,
        starts_at: occStart.toISOString(),
        ends_at: occEnd ? occEnd.toISOString() : null,
      };
    });

    setBusy(true);
    const { data, error: insertError } = await supabase
      .from('events')
      .insert(rows)
      .select('id, starts_at')
      .order('starts_at', { ascending: true });
    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }
    const firstId = data?.[0]?.id;
    if (firstId && photoAsset) {
      const result = await uploadPhoto('event-photos', firstId, photoAsset);
      if ('error' in result) {
        setError(`Event created, but photo upload failed: ${result.error}`);
      } else {
        const ids = (data ?? []).map((r) => r.id);
        await supabase.from('events').update({ photo_path: result.path }).in('id', ids);
      }
    }
    if (firstId) {
      router.replace(`/event/${firstId}`);
    } else {
      router.back();
    }
  };

  const onPickPhoto = async () => {
    const asset = await pickImage();
    if (asset) setPhotoAsset(asset);
  };

  if (profile && profile.level !== 'selkie') {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: palette.background }]}
        edges={['top']}>
        <Header onBack={() => router.back()} title="Create event" />
        <Card style={{ marginTop: 16 }}>
          <Text style={[styles.errTitle, { color: OtterPalette.ice }]}>Selkies only</Text>
          <Text style={[styles.body, { color: palette.muted, marginTop: 6 }]}>
            Only Selkies can create events. You're currently a {profile.level}.
          </Text>
        </Card>
      </SafeAreaView>
    );
  }

  const fieldStyle = (field: FieldKey) => [
    styles.input,
    {
      color: palette.text,
      borderColor: fieldErrors[field] ? OtterPalette.ice : palette.border,
      borderWidth: fieldErrors[field] ? 1.5 : 1,
    },
  ];

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: palette.background }]}
      edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header onBack={() => router.back()} title="Create event" />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled">
          {/* ---------- The basics ---------- */}
          <SectionTitle>The basics</SectionTitle>
          <Card>
            <FieldLabel palette={palette}>Title</FieldLabel>
            <TextInput
              value={title}
              onChangeText={(t) => {
                setTitle(t);
                if (fieldErrors.title) setFieldErrors((e) => ({ ...e, title: undefined }));
              }}
              placeholder={titlePlaceholder}
              placeholderTextColor={palette.muted}
              style={fieldStyle('title')}
            />
            <FieldError text={fieldErrors.title} />

            <FieldLabel palette={palette} style={{ marginTop: 14 }}>
              Category
            </FieldLabel>
            {groupCategories(categories).map((group) => (
              <View key={group.label} style={{ marginBottom: 10 }}>
                <Text
                  style={[
                    styles.groupLabel,
                    { color: palette.muted, borderColor: palette.border },
                  ]}>
                  {group.label}
                </Text>
                <View style={styles.chipWrap}>
                  {group.items.map(({ category, label }) => {
                    const isActive = category.id === categoryId;
                    return (
                      <Pressable
                        key={category.id}
                        testID={`category-chip-${category.id}`}
                        onPress={() => onPickCategory(category)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: isActive
                              ? OtterPalette.slateNavy
                              : palette.surface,
                            borderColor: isActive
                              ? OtterPalette.slateNavy
                              : palette.border,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.chipText,
                            { color: isActive ? '#fff' : palette.text },
                          ]}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
            {selectedCategory ? (
              <Text style={[styles.hint, { color: palette.muted, marginTop: 6 }]}>
                Default min level: {selectedCategory.default_min_level} · default cost: £
                {Number(selectedCategory.default_cost).toFixed(0)}
              </Text>
            ) : null}
            <FieldError text={fieldErrors.category} />

            {(() => {
              const opts = gradeOptionsFor(selectedCategory);
              if (!opts) return null;
              return (
                <>
                  <FieldLabel palette={palette} style={{ marginTop: 14 }}>
                    Grade
                  </FieldLabel>
                  <Row style={{ gap: 8, flexWrap: 'wrap' }}>
                    {opts.map((g) => {
                      const isActive = g === grade;
                      return (
                        <Pressable
                          key={g}
                          testID={`grade-chip-${g}`}
                          onPress={() => setGrade(g)}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: isActive
                                ? OtterPalette.slateNavy
                                : palette.surface,
                              borderColor: isActive
                                ? OtterPalette.slateNavy
                                : palette.border,
                            },
                          ]}>
                          <Text
                            style={[
                              styles.chipText,
                              { color: isActive ? '#fff' : palette.text },
                            ]}>
                            {g}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </Row>
                </>
              );
            })()}
          </Card>

          {/* ---------- When ---------- */}
          <SectionTitle>When</SectionTitle>
          <Card>
            <View
              style={[
                wideLayout
                  ? { flexDirection: 'row', gap: 12, alignItems: 'flex-start' }
                  : null,
              ]}>
              <View style={wideLayout ? { flex: 2 } : null}>
                <FieldLabel palette={palette}>Starts at</FieldLabel>
                <DateTimeField
                  value={startsAt}
                  onChange={(v) => {
                    setStartsAt(v);
                    if (fieldErrors.startsAt)
                      setFieldErrors((e) => ({ ...e, startsAt: undefined }));
                  }}
                  style={fieldStyle('startsAt')}
                  placeholderColor={palette.muted}
                />
                <FieldError text={fieldErrors.startsAt} />
              </View>
              <View style={[wideLayout ? { flex: 1 } : { marginTop: 14 }]}>
                <FieldLabel palette={palette}>Duration (hours)</FieldLabel>
                <TextInput
                  value={durationHours}
                  onChangeText={(t) => {
                    setDurationHours(t);
                    if (fieldErrors.duration)
                      setFieldErrors((e) => ({ ...e, duration: undefined }));
                  }}
                  keyboardType="decimal-pad"
                  placeholder="2"
                  placeholderTextColor={palette.muted}
                  style={fieldStyle('duration')}
                />
                <FieldError text={fieldErrors.duration} />
              </View>
            </View>

            <FieldLabel palette={palette} style={{ marginTop: 14 }}>
              Repeat
            </FieldLabel>
            <Row style={{ gap: 8, flexWrap: 'wrap' }}>
              {(
                [
                  { value: false, label: 'One-off' },
                  { value: true, label: 'Repeats' },
                ] as const
              ).map((opt) => {
                const isActive = opt.value === repeatEnabled;
                return (
                  <Pressable
                    key={String(opt.value)}
                    testID={`event-repeat-${opt.value ? 'on' : 'off'}`}
                    onPress={() => setRepeatEnabled(opt.value)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isActive ? OtterPalette.slateNavy : palette.surface,
                        borderColor: isActive ? OtterPalette.slateNavy : palette.border,
                      },
                    ]}>
                    <Text
                      style={[styles.chipText, { color: isActive ? '#fff' : palette.text }]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>
            {repeatEnabled ? (
              <View style={{ marginTop: 12 }}>
                <Row style={{ gap: 8, flexWrap: 'wrap' }}>
                  {(['weekly', 'fortnightly'] as const).map((freq) => {
                    const isActive = freq === repeatFrequency;
                    return (
                      <Pressable
                        key={freq}
                        testID={`event-repeat-${freq}`}
                        onPress={() => setRepeatFrequency(freq)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: isActive ? OtterPalette.slateNavy : palette.surface,
                            borderColor: isActive ? OtterPalette.slateNavy : palette.border,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.chipText,
                            { color: isActive ? '#fff' : palette.text },
                          ]}>
                          {freq === 'weekly' ? 'Every week' : 'Every 2 weeks'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </Row>
                <FieldLabel palette={palette} style={{ marginTop: 12 }}>
                  Total occurrences (incl. the first)
                </FieldLabel>
                <TextInput
                  value={repeatCount}
                  onChangeText={(t) => {
                    setRepeatCount(t);
                    if (fieldErrors.repeatCount)
                      setFieldErrors((e) => ({ ...e, repeatCount: undefined }));
                  }}
                  keyboardType="number-pad"
                  testID="event-repeat-count"
                  placeholder="4"
                  placeholderTextColor={palette.muted}
                  style={fieldStyle('repeatCount')}
                />
                <FieldError text={fieldErrors.repeatCount} />
                {occurrencePreview.length > 0 ? (
                  <View
                    style={{
                      marginTop: 10,
                      padding: 10,
                      borderRadius: 8,
                      backgroundColor: palette.surface,
                      borderWidth: 1,
                      borderColor: palette.border,
                    }}>
                    <Text
                      style={[styles.hint, { color: palette.muted, marginBottom: 6 }]}>
                      Preview (first {occurrencePreview.length} of {Number(repeatCount)})
                    </Text>
                    {occurrencePreview.map((d, i) => (
                      <Text
                        key={i}
                        style={[styles.body, { color: palette.text, marginTop: 2 }]}>
                        · {formatPreviewDate(d)}
                      </Text>
                    ))}
                    <Text
                      style={[styles.hint, { color: palette.muted, marginTop: 6 }]}>
                      Each occurrence is a separate event with its own sign-ups.
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </Card>

          {/* ---------- Where ---------- */}
          <SectionTitle>Where</SectionTitle>
          <Card>
            <FieldLabel palette={palette}>Location</FieldLabel>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. Loch Lomond, Balmaha"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />
            <FieldLabel palette={palette} style={{ marginTop: 14 }}>
              Meeting point
            </FieldLabel>
            <TextInput
              value={meetingPoint}
              onChangeText={setMeetingPoint}
              placeholder="e.g. Balmaha car park"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />
          </Card>

          {/* ---------- Capacity & cost ---------- */}
          <SectionTitle>Capacity & cost</SectionTitle>
          <Card>
            <FieldLabel palette={palette}>Minimum level</FieldLabel>
            <Row style={{ gap: 8, flexWrap: 'wrap' }}>
              {LEVELS.map((lv) => {
                const isActive = lv === minLevel;
                return (
                  <Pressable
                    key={lv}
                    onPress={() => {
                      setMinLevel(lv);
                      setMinLevelTouched(true);
                    }}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isActive ? OtterPalette.slateNavy : palette.surface,
                        borderColor: isActive ? OtterPalette.slateNavy : palette.border,
                      },
                    ]}>
                    <Text
                      style={[styles.chipText, { color: isActive ? '#fff' : palette.text }]}>
                      {LEVEL_EMOJI[lv]} {lv}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>

            <Row style={{ gap: 12, marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <FieldLabel palette={palette}>Max participants</FieldLabel>
                <TextInput
                  value={maxParticipants}
                  onChangeText={(t) => {
                    setMaxParticipants(t);
                    if (fieldErrors.maxParticipants)
                      setFieldErrors((e) => ({ ...e, maxParticipants: undefined }));
                  }}
                  keyboardType="number-pad"
                  placeholder="no cap"
                  placeholderTextColor={palette.muted}
                  style={fieldStyle('maxParticipants')}
                />
                <FieldError text={fieldErrors.maxParticipants} />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel palette={palette}>Cost (£)</FieldLabel>
                <TextInput
                  value={cost}
                  onChangeText={(t) => {
                    setCost(t);
                    if (fieldErrors.cost) setFieldErrors((e) => ({ ...e, cost: undefined }));
                  }}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={palette.muted}
                  style={fieldStyle('cost')}
                />
                <FieldError text={fieldErrors.cost} />
              </View>
            </Row>

            <FieldLabel palette={palette} style={{ marginTop: 14 }}>
              Approval mode
            </FieldLabel>
            <Row style={{ gap: 8, flexWrap: 'wrap' }}>
              {(['auto', 'manual_all'] as const).map((mode) => {
                const isActive = mode === approvalMode;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => setApprovalMode(mode)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isActive ? OtterPalette.slateNavy : palette.surface,
                        borderColor: isActive ? OtterPalette.slateNavy : palette.border,
                      },
                    ]}>
                    <Text
                      style={[styles.chipText, { color: isActive ? '#fff' : palette.text }]}>
                      {mode === 'auto' ? 'Auto-approve (uses ceiling)' : 'Manual review all'}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>
          </Card>

          {/* ---------- Photo & description ---------- */}
          <SectionTitle>Photo & description</SectionTitle>
          <Card>
            <FieldLabel palette={palette}>Photo (optional)</FieldLabel>
            {photoAsset ? (
              <Image
                source={{ uri: photoAsset.uri }}
                style={styles.photoPreview}
                contentFit="cover"
              />
            ) : null}
            <Row style={{ gap: 8 }}>
              <Pressable
                testID="event-pick-photo"
                onPress={onPickPhoto}
                style={[
                  styles.chip,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}>
                <Text style={[styles.chipText, { color: palette.text }]}>
                  {photoAsset ? 'Change photo' : 'Pick photo'}
                </Text>
              </Pressable>
              {photoAsset ? (
                <Pressable
                  onPress={() => setPhotoAsset(null)}
                  style={[
                    styles.chip,
                    { backgroundColor: palette.surface, borderColor: palette.border },
                  ]}>
                  <Text style={[styles.chipText, { color: palette.muted }]}>Remove</Text>
                </Pressable>
              ) : null}
            </Row>

            <FieldLabel palette={palette} style={{ marginTop: 14 }}>
              Description (optional)
            </FieldLabel>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              placeholder="What members should know"
              placeholderTextColor={palette.muted}
              style={[
                styles.input,
                {
                  color: palette.text,
                  borderColor: palette.border,
                  minHeight: 100,
                  textAlignVertical: 'top',
                },
              ]}
            />
          </Card>

        </ScrollView>

        {/* ---------- Sticky submit ---------- */}
        <View
          style={[
            styles.footer,
            { backgroundColor: palette.background, borderTopColor: palette.border },
          ]}>
          {error ? (
            <Text
              style={[styles.footerError, { color: OtterPalette.ice }]}
              numberOfLines={2}>
              {error}
            </Text>
          ) : null}
          <Pressable
            testID="event-create-submit"
            onPress={busy ? undefined : submit}
            disabled={busy}
            style={[
              styles.primaryBtn,
              { backgroundColor: OtterPalette.slateNavy, opacity: busy ? 0.7 : 1 },
            ]}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {repeatEnabled
                  ? `Create ${Number(repeatCount) || ''} events`.trim()
                  : 'Create event'}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FieldLabel({
  children,
  palette,
  style,
}: {
  children: React.ReactNode;
  palette: ReturnType<typeof Colors[keyof typeof Colors] extends infer T ? () => T : never> extends () => infer R ? R : { text: string };
  style?: object;
}) {
  return (
    <Text
      style={[
        { fontSize: 12, fontWeight: '700', marginBottom: 6, color: (palette as { text: string }).text },
        style,
      ]}>
      {children}
    </Text>
  );
}

function FieldError({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <Text style={{ color: OtterPalette.ice, fontSize: 12, marginTop: 6 }}>{text}</Text>
  );
}

type DateTimeFieldProps = {
  value: string;
  onChange: (v: string) => void;
  style: object | object[];
  placeholderColor: string;
};

function DateTimeField({ value, onChange, style, placeholderColor }: DateTimeFieldProps) {
  if (Platform.OS === 'web') {
    const flat: Record<string, unknown> = Array.isArray(style)
      ? Object.assign({}, ...style)
      : (style as Record<string, unknown>);
    // RN shorthand → real CSS, otherwise the browser drops them and the field
    // ends up too short / unpadded compared to the other inputs.
    const css: React.CSSProperties = {
      boxSizing: 'border-box',
      width: '100%',
      fontFamily: 'inherit',
      fontSize: 15,
      lineHeight: '20px',
      paddingTop: 12,
      paddingBottom: 12,
      paddingLeft: 12,
      paddingRight: 12,
      borderRadius: 10,
      borderStyle: 'solid',
      borderWidth: (flat.borderWidth as number) ?? 1,
      borderColor: (flat.borderColor as string) ?? '#ccc',
      color: (flat.color as string) ?? 'inherit',
      backgroundColor: 'transparent',
      outline: 'none',
    };
    return React.createElement('input', {
      type: 'datetime-local',
      value,
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      style: css,
    });
  }
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      autoCapitalize="none"
      placeholder="YYYY-MM-DDTHH:MM"
      placeholderTextColor={placeholderColor}
      style={style as never}
    />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  backBtn: { paddingHorizontal: 8, paddingVertical: 4, minWidth: 56 },
  backText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
  },
  hint: { fontSize: 11, fontStyle: 'italic' },
  errTitle: { fontSize: 14, fontWeight: '700' },
  body: { fontSize: 13 },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  photoPreview: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    marginBottom: 10,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
    borderTopWidth: 1,
  },
  footerError: {
    fontSize: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
});
