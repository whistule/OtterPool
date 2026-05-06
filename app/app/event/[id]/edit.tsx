import { Image } from 'expo-image';
import type * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
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

import { EventPhoto } from '@/components/photo';
import { Card, Row, SectionTitle } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth';
import { pickImage, removePhoto, uploadPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';

type Category = {
  id: number;
  name: string;
  default_min_level: 'frog' | 'duck' | 'otter' | 'dolphin' | 'selkie';
  default_cost: number;
};

type EventRow = {
  id: string;
  title: string;
  category_id: number;
  description: string | null;
  grade_advertised: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  meeting_point: string | null;
  min_level: 'frog' | 'duck' | 'otter' | 'dolphin' | 'selkie';
  max_participants: number | null;
  cost: number;
  approval_mode: 'auto' | 'manual_all';
  status: 'draft' | 'open' | 'full' | 'closed' | 'cancelled';
  leader_id: string;
  photo_path: string | null;
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

const STATUS_OPTIONS: Array<{
  value: 'draft' | 'open' | 'closed' | 'cancelled';
  label: string;
  color: string;
}> = [
  { value: 'draft', label: 'Draft', color: OtterPalette.slateNavy },
  { value: 'open', label: 'Open', color: OtterPalette.forest },
  { value: 'closed', label: 'Closed', color: OtterPalette.lochPool },
  { value: 'cancelled', label: 'Cancelled', color: OtterPalette.ice },
];

function toLocalIsoMinutes(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function durationHoursBetween(startIso: string, endIso: string | null): string {
  if (!endIso) return '';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!isFinite(ms) || ms <= 0) return '';
  const hours = ms / (1000 * 60 * 60);
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(2);
}

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const palette = Colors[useColorScheme() ?? 'light'];
  const { session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [originalPhotoPath, setOriginalPhotoPath] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [grade, setGrade] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [location, setLocation] = useState('');
  const [meetingPoint, setMeetingPoint] = useState('');
  const [minLevel, setMinLevel] = useState<'frog' | 'duck' | 'otter' | 'dolphin'>('frog');
  const [maxParticipants, setMaxParticipants] = useState('');
  const [cost, setCost] = useState('0');
  const [approvalMode, setApprovalMode] = useState<'auto' | 'manual_all'>('auto');
  const [status, setStatus] = useState<'draft' | 'open' | 'full' | 'closed' | 'cancelled'>('open');
  const [description, setDescription] = useState('');
  const [photoAsset, setPhotoAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [removePhotoFlag, setRemovePhotoFlag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !id) return;
    let cancelled = false;
    (async () => {
      const [catRes, evRes] = await Promise.all([
        supabase
          .from('event_categories')
          .select('id, name, default_min_level, default_cost')
          .order('id'),
        supabase
          .from('events')
          .select(
            'id, title, category_id, description, grade_advertised, starts_at, ends_at, location, meeting_point, min_level, max_participants, cost, approval_mode, status, leader_id, photo_path',
          )
          .eq('id', id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (catRes.error) {
        setError(`Couldn't load categories: ${catRes.error.message}`);
      } else {
        setCategories((catRes.data ?? []) as Category[]);
      }
      if (evRes.error || !evRes.data) {
        setError(evRes.error?.message ?? 'Event not found');
        setLoading(false);
        return;
      }
      const ev = evRes.data as EventRow;
      if (ev.leader_id !== session.user.id) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      setCategoryId(ev.category_id);
      setTitle(ev.title);
      setGrade(ev.grade_advertised ?? '');
      setStartsAt(toLocalIsoMinutes(new Date(ev.starts_at)));
      setDurationHours(durationHoursBetween(ev.starts_at, ev.ends_at));
      setLocation(ev.location ?? '');
      setMeetingPoint(ev.meeting_point ?? '');
      setMinLevel(ev.min_level === 'selkie' ? 'dolphin' : ev.min_level);
      setMaxParticipants(ev.max_participants == null ? '' : String(ev.max_participants));
      setCost(String(Number(ev.cost ?? 0)));
      setApprovalMode(ev.approval_mode);
      setStatus(ev.status);
      setDescription(ev.description ?? '');
      setOriginalPhotoPath(ev.photo_path);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [session, id]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId],
  );

  const submit = async () => {
    if (!session || !id) return;
    setError(null);
    if (!title.trim()) return setError('Title is required');
    if (!categoryId) return setError('Pick a category');

    const startDate = new Date(startsAt);
    if (isNaN(startDate.getTime())) {
      return setError('Start time is not a valid date — use YYYY-MM-DDTHH:MM');
    }
    const dur = Number(durationHours);
    const endDate =
      durationHours.trim() && dur > 0
        ? new Date(startDate.getTime() + dur * 60 * 60 * 1000)
        : null;

    const maxP = maxParticipants.trim() ? Number(maxParticipants) : null;
    if (maxP !== null && (isNaN(maxP) || maxP < 1)) {
      return setError('Max participants must be a positive number or blank');
    }
    const costNum = Number(cost);
    if (isNaN(costNum) || costNum < 0) {
      return setError('Cost must be a number');
    }

    setBusy(true);

    // Upload new photo first so we can include the path in a single update.
    let newPath: string | null | undefined = undefined; // undefined = no change
    if (removePhotoFlag) newPath = null;
    if (photoAsset) {
      const result = await uploadPhoto('event-photos', id, photoAsset);
      if ('error' in result) {
        setError(`Photo upload failed: ${result.error}`);
        setBusy(false);
        return;
      }
      newPath = result.path;
    }

    const update: Record<string, unknown> = {
      title: title.trim(),
      category_id: categoryId,
      description: description.trim() || null,
      grade_advertised: grade.trim() || null,
      starts_at: startDate.toISOString(),
      ends_at: endDate ? endDate.toISOString() : null,
      location: location.trim() || null,
      meeting_point: meetingPoint.trim() || null,
      min_level: minLevel,
      max_participants: maxP,
      cost: costNum,
      approval_mode: approvalMode,
      status,
    };
    if (newPath !== undefined) update.photo_path = newPath;

    const { error: updateError } = await supabase
      .from('events')
      .update(update)
      .eq('id', id);
    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    // Best-effort: delete the old photo if it was replaced or cleared.
    if (newPath !== undefined && originalPhotoPath && originalPhotoPath !== newPath) {
      await removePhoto('event-photos', originalPhotoPath);
    }

    router.replace(`/event/${id}`);
  };

  const onPickPhoto = async () => {
    const asset = await pickImage();
    if (asset) {
      setPhotoAsset(asset);
      setRemovePhotoFlag(false);
    }
  };

  const onClearPhoto = () => {
    setPhotoAsset(null);
    setRemovePhotoFlag(true);
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: palette.background }]}
        edges={['top']}>
        <Header onBack={() => router.back()} title="Edit event" />
        <View style={styles.center}>
          <ActivityIndicator color={palette.tint} />
        </View>
      </SafeAreaView>
    );
  }

  if (forbidden) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: palette.background }]}
        edges={['top']}>
        <Header onBack={() => router.back()} title="Edit event" />
        <Card style={{ marginTop: 16 }}>
          <Text style={[styles.errTitle, { color: OtterPalette.ice }]}>
            Only the event leader can edit this event.
          </Text>
        </Card>
      </SafeAreaView>
    );
  }

  const showExistingPhoto = !photoAsset && !removePhotoFlag && originalPhotoPath;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: palette.background }]}
      edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header onBack={() => router.back()} title="Edit event" />
        <ScrollView
          contentContainerStyle={{ paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled">
          <SectionTitle>Photo</SectionTitle>
          <Card>
            {photoAsset ? (
              <Image
                source={{ uri: photoAsset.uri }}
                style={styles.photoPreview}
                contentFit="cover"
              />
            ) : showExistingPhoto ? (
              <EventPhoto
                path={originalPhotoPath}
                height={140}
                style={{ marginBottom: 10 }}
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
                  {photoAsset || originalPhotoPath ? 'Change photo' : 'Pick photo'}
                </Text>
              </Pressable>
              {photoAsset || (originalPhotoPath && !removePhotoFlag) ? (
                <Pressable
                  onPress={onClearPhoto}
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
                    onPress={() => setCategoryId(c.id)}
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
          </Card>

          <SectionTitle>Duration (hours)</SectionTitle>
          <Card>
            <TextInput
              value={durationHours}
              onChangeText={setDurationHours}
              keyboardType="decimal-pad"
              placeholder="leave blank for no end time"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />
          </Card>

          <SectionTitle>Location</SectionTitle>
          <Card>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />
          </Card>

          <SectionTitle>Meeting point</SectionTitle>
          <Card>
            <TextInput
              value={meetingPoint}
              onChangeText={setMeetingPoint}
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
                    onPress={() => setMinLevel(lv)}
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
            <Row style={{ gap: 8, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map((opt) => {
                const isActive = opt.value === status;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setStatus(opt.value)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isActive ? opt.color : palette.surface,
                        borderColor: isActive ? opt.color : palette.border,
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
            {status === 'full' ? (
              <Text style={[styles.hint, { color: palette.muted, marginTop: 8 }]}>
                Status was auto-set to "Full" by sign-ups. Change it to Closed if you want to
                stop further sign-ups manually.
              </Text>
            ) : null}
          </Card>

          <SectionTitle>Description (optional)</SectionTitle>
          <Card>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
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
              testID="event-edit-submit"
              onPress={busy ? undefined : submit}
              disabled={busy}
              style={[
                styles.primaryBtn,
                { backgroundColor: OtterPalette.slateNavy, opacity: busy ? 0.7 : 1 },
              ]}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Save changes</Text>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
