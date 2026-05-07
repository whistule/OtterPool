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

export default function NewEventScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const { session, profile } = useAuth();

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
  const [status, setStatus] = useState<'draft' | 'open'>('open');
  const [description, setDescription] = useState('');
  const [photoAsset, setPhotoAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState<'weekly' | 'fortnightly'>('weekly');
  const [repeatCount, setRepeatCount] = useState('4');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const onPickCategory = (c: Category) => {
    setCategoryId(c.id);
    if (!minLevelTouched) {
      setMinLevel(c.default_min_level === 'selkie' ? 'dolphin' : c.default_min_level);
    }
    setCost(String(c.default_cost ?? 0));
  };

  const submit = async () => {
    if (!session) return;
    setError(null);
    if (!title.trim()) return setError('Title is required');
    if (!categoryId) return setError('Pick a category');

    const startDate = new Date(startsAt);
    if (isNaN(startDate.getTime())) {
      return setError('Start time is not a valid date — use YYYY-MM-DDTHH:MM');
    }
    const dur = Number(durationHours);
    const endDate =
      dur > 0 ? new Date(startDate.getTime() + dur * 60 * 60 * 1000) : null;

    const maxP = maxParticipants.trim() ? Number(maxParticipants) : null;
    if (maxP !== null && (isNaN(maxP) || maxP < 1)) {
      return setError('Max participants must be a positive number or blank');
    }
    const costNum = Number(cost);
    if (isNaN(costNum) || costNum < 0) {
      return setError('Cost must be a number');
    }

    let occurrences = 1;
    let seriesId: string | null = null;
    if (repeatEnabled) {
      const n = Number(repeatCount);
      if (!Number.isInteger(n) || n < 2 || n > 26) {
        return setError('Repeat count must be a whole number between 2 and 26');
      }
      occurrences = n;
      seriesId = uuidv4();
    }
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
      status,
      leader_id: session.user.id,
      series_id: seriesId,
    };

    const rows = Array.from({ length: occurrences }, (_, i) => {
      const occStart = new Date(startDate.getTime());
      occStart.setDate(occStart.getDate() + i * stepDays);
      const occEnd =
        endDate ? new Date(occStart.getTime() + (endDate.getTime() - startDate.getTime())) : null;
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
          <Text style={[styles.errTitle, { color: OtterPalette.ice }]}>
            Selkies only
          </Text>
          <Text style={[styles.body, { color: palette.muted, marginTop: 6 }]}>
            Only Selkies can create events. You're currently a {profile.level}.
          </Text>
        </Card>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: palette.background }]}
      edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header onBack={() => router.back()} title="Create event" />
        <ScrollView
          contentContainerStyle={{ paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled">
          <SectionTitle>Photo (optional)</SectionTitle>
          <Card>
            {photoAsset ? (
              <Image
                source={{ uri: photoAsset.uri }}
                style={styles.photoPreview}
                contentFit="cover"
              />
            ) : null}
            {photoAsset ? (
              <Row style={{ gap: 8, marginBottom: 6 }}>
                <Text style={[styles.hint, { color: palette.muted, flex: 1 }]} numberOfLines={1}>
                  Selected: {photoAsset.fileName ?? 'image'}
                </Text>
              </Row>
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
          </Card>

          <SectionTitle>Title</SectionTitle>
          <Card>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Sea Kayak — Cumbrae circumnavigation"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />
          </Card>

          <SectionTitle>Category</SectionTitle>
          <Card>
            <View style={styles.chipWrap}>
              {categories.map((c) => {
                const isActive = c.id === categoryId;
                return (
                  <Pressable
                    key={c.id}
                    testID={`category-chip-${c.id}`}
                    onPress={() => onPickCategory(c)}
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
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {selectedCategory ? (
              <Text style={[styles.hint, { color: palette.muted, marginTop: 10 }]}>
                Default min level: {selectedCategory.default_min_level} · default cost: £
                {Number(selectedCategory.default_cost).toFixed(0)}
              </Text>
            ) : null}
          </Card>

          <SectionTitle>Grade / pump level (optional)</SectionTitle>
          <Card>
            <TextInput
              value={grade}
              onChangeText={setGrade}
              placeholder="e.g. Sea B, G2/3, P2"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />
          </Card>

          <SectionTitle>Starts at</SectionTitle>
          <Card>
            <TextInput
              value={startsAt}
              onChangeText={setStartsAt}
              autoCapitalize="none"
              placeholder="YYYY-MM-DDTHH:MM"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />
            <Text style={[styles.hint, { color: palette.muted, marginTop: 6 }]}>
              Local time. Datetime picker comes later.
            </Text>
          </Card>

          <SectionTitle>Duration (hours)</SectionTitle>
          <Card>
            <TextInput
              value={durationHours}
              onChangeText={setDurationHours}
              keyboardType="decimal-pad"
              placeholder="2"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />
          </Card>

          <SectionTitle>Repeat (optional)</SectionTitle>
          <Card>
            <Row style={{ gap: 8, flexWrap: 'wrap' }}>
              {([
                { value: false, label: 'One-off' },
                { value: true, label: 'Repeats' },
              ] as const).map((opt) => {
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
                      style={[
                        styles.chipText,
                        { color: isActive ? '#fff' : palette.text },
                      ]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>
            {repeatEnabled ? (
              <>
                <Row style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
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
                <Text style={[styles.hint, { color: palette.muted, marginTop: 10 }]}>
                  How many occurrences in total (incl. the first)?
                </Text>
                <TextInput
                  value={repeatCount}
                  onChangeText={setRepeatCount}
                  keyboardType="number-pad"
                  testID="event-repeat-count"
                  placeholder="4"
                  placeholderTextColor={palette.muted}
                  style={[
                    styles.input,
                    { color: palette.text, borderColor: palette.border, marginTop: 6 },
                  ]}
                />
                <Text style={[styles.hint, { color: palette.muted, marginTop: 6 }]}>
                  Each occurrence is a separate event with its own sign-ups.
                </Text>
              </>
            ) : null}
          </Card>

          <SectionTitle>Location</SectionTitle>
          <Card>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. Loch Lomond, Balmaha"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />
          </Card>

          <SectionTitle>Meeting point</SectionTitle>
          <Card>
            <TextInput
              value={meetingPoint}
              onChangeText={setMeetingPoint}
              placeholder="e.g. Balmaha car park"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />
          </Card>

          <SectionTitle>Minimum level</SectionTitle>
          <Card>
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
                      style={[
                        styles.chipText,
                        { color: isActive ? '#fff' : palette.text },
                      ]}>
                      {LEVEL_EMOJI[lv]} {lv}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>
          </Card>

          <SectionTitle>Max participants</SectionTitle>
          <Card>
            <TextInput
              value={maxParticipants}
              onChangeText={setMaxParticipants}
              keyboardType="number-pad"
              placeholder="leave blank for no cap"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />
          </Card>

          <SectionTitle>Cost (£)</SectionTitle>
          <Card>
            <TextInput
              value={cost}
              onChangeText={setCost}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />
          </Card>

          <SectionTitle>Approval mode</SectionTitle>
          <Card>
            <Row style={{ gap: 8 }}>
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
                      style={[
                        styles.chipText,
                        { color: isActive ? '#fff' : palette.text },
                      ]}>
                      {mode === 'auto' ? 'Auto-approve (uses ceiling)' : 'Manual review all'}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>
          </Card>

          <SectionTitle>Status</SectionTitle>
          <Card>
            <Row style={{ gap: 8 }}>
              {(['draft', 'open'] as const).map((s) => {
                const isActive = s === status;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setStatus(s)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isActive
                          ? s === 'open'
                            ? OtterPalette.forest
                            : OtterPalette.slateNavy
                          : palette.surface,
                        borderColor: isActive
                          ? s === 'open'
                            ? OtterPalette.forest
                            : OtterPalette.slateNavy
                          : palette.border,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.chipText,
                        { color: isActive ? '#fff' : palette.text },
                      ]}>
                      {s === 'draft' ? 'Save as draft' : 'Publish open'}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>
            <Text style={[styles.hint, { color: palette.muted, marginTop: 8 }]}>
              Drafts won't appear on the calendar.
            </Text>
          </Card>

          <SectionTitle>Description (optional)</SectionTitle>
          <Card>
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

          {error ? (
            <Card style={{ borderColor: OtterPalette.ice, borderWidth: 1.5 }}>
              <Text style={{ color: OtterPalette.ice }}>{error}</Text>
            </Card>
          ) : null}

          <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
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
                <Text style={styles.primaryBtnText}>Create event</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
});
