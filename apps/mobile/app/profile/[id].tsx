import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Ceiling,
  CeilingsCard,
  CurrentLevelCard,
  JourneyLadder,
} from '@/components/progress-blocks';
import { Header } from '@/components/header';
import { Avatar } from '@/components/photo';
import { ErrorCard, LoadingCenter } from '@/components/screen-states';
import { Card, Pill, Row, SectionTitle } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoadOnFocus } from '@/hooks/use-load-on-focus';
import { useAuth } from '@/lib/auth';
import { MEMBER_STATUS_COLOR, MemberStatus } from '@/lib/status';
import {
  LEVEL_EMOJI,
  LEVEL_LABEL,
  LEVEL_ORDER,
  ProgressionLevel,
  Track,
  TRACK_GRADES,
  TRACK_LABEL,
} from '@/lib/progress';
import { supabase } from '@/lib/supabase';

type ProfileRow = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  level: ProgressionLevel;
  status: 'active' | 'aspirant' | 'lapsed' | 'suspended';
  created_at: string;
  avatar_path: string | null;
};

type ApprovalRow = { track: Track; ceiling: string };

export default function MemberProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const palette = Colors[useColorScheme() ?? 'light'];
  const { profile: viewerProfile, session } = useAuth();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [ceilings, setCeilings] = useState<Ceiling[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingLevel, setSavingLevel] = useState(false);
  const [savingTrack, setSavingTrack] = useState<Track | null>(null);
  const [levelEditOpen, setLevelEditOpen] = useState(false);
  const [trackEdit, setTrackEdit] = useState<Track | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !session) return;
    setError(null);
    const [profRes, ceilRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, display_name, level, status, created_at, avatar_path')
        .eq('id', id)
        .maybeSingle(),
      supabase.from('member_approvals').select('track, ceiling').eq('member_id', id),
    ]);
    if (profRes.error) setError(profRes.error.message);
    setProfile((profRes.data as ProfileRow) ?? null);
    setCeilings(((ceilRes.data ?? []) as ApprovalRow[]).map((r) => ({ ...r })));
    setLoading(false);
  }, [id, session]);

  useLoadOnFocus(load);

  const onChangeLevel = async (next: ProgressionLevel) => {
    if (!id) return;
    setSavingLevel(true);
    const { error: err } = await supabase
      .from('profiles')
      .update({ level: next })
      .eq('id', id);
    setSavingLevel(false);
    if (err) {
      setError(err.message);
    } else {
      setProfile((p) => (p ? { ...p, level: next } : p));
    }
    setLevelEditOpen(false);
  };

  const onSetCeiling = async (track: Track, ceiling: string | null) => {
    if (!id || !session) return;
    setSavingTrack(track);
    if (ceiling == null) {
      const { error: err } = await supabase
        .from('member_approvals')
        .delete()
        .eq('member_id', id)
        .eq('track', track);
      if (err) setError(err.message);
      else setCeilings((cs) => cs.filter((c) => c.track !== track));
    } else {
      const { error: err } = await supabase.from('member_approvals').upsert({
        member_id: id,
        track,
        ceiling,
        set_by: session.user.id,
        set_at: new Date().toISOString(),
      });
      if (err) setError(err.message);
      else
        setCeilings((cs) => {
          const others = cs.filter((c) => c.track !== track);
          return [...others, { track, ceiling }];
        });
    }
    setSavingTrack(null);
    setTrackEdit(null);
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: palette.background }]}
        edges={['top']}>
        <Header onBack={() => router.back()} />
        <LoadingCenter />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: palette.background }]}
        edges={['top']}>
        <Header onBack={() => router.back()} />
        <ErrorCard title="Member not found" />
      </SafeAreaView>
    );
  }

  const name = profile.display_name ?? profile.full_name ?? 'Member';
  const levelEmoji = LEVEL_EMOJI[profile.level];
  const isSelf = profile.id === viewerProfile?.id;
  const canEdit = !!viewerProfile?.is_admin && !isSelf;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: palette.background }]}
      edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Header onBack={() => router.back()} />

        <Card>
          <Row style={{ gap: 14 }}>
            <Avatar path={profile.avatar_path} size={64} fallback={levelEmoji} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: palette.text }]}>{name}</Text>
              {profile.full_name &&
              profile.display_name &&
              profile.full_name !== profile.display_name ? (
                <Text style={[styles.muted, { color: palette.muted, marginTop: 2 }]}>
                  {profile.full_name}
                </Text>
              ) : null}
              <Row style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <Pill
                  label={`${levelEmoji} ${LEVEL_LABEL[profile.level]}`}
                  color={OtterPalette.slateNavy}
                />
                <Pill
                  label={profile.status}
                  color={MEMBER_STATUS_COLOR[profile.status as MemberStatus] ?? OtterPalette.lochPool}
                />
              </Row>
            </View>
          </Row>
        </Card>

        {error ? <ErrorCard title={error} /> : null}

        <SectionTitle>Current level</SectionTitle>
        <CurrentLevelCard level={profile.level} createdAt={profile.created_at} />
        {canEdit ? (
          <Pressable
            onPress={() => setLevelEditOpen(true)}
            disabled={savingLevel}
            testID="change-level-cta">
            <Card style={styles.editCta}>
              <Text style={styles.editCtaText}>
                {savingLevel ? 'Saving…' : 'Change animal level'}
              </Text>
            </Card>
          </Pressable>
        ) : null}

        <SectionTitle>Approval ceiling</SectionTitle>
        <CeilingsCard
          ceilings={ceilings}
          onPressTrack={canEdit ? (t) => setTrackEdit(t) : undefined}
        />
        {canEdit ? (
          <Text style={[styles.hint, { color: palette.muted }]}>
            Tap a track to set or clear the ceiling.
          </Text>
        ) : null}

        <SectionTitle>The journey</SectionTitle>
        <JourneyLadder level={profile.level} />
      </ScrollView>

      <LevelPicker
        visible={levelEditOpen}
        current={profile.level}
        onClose={() => setLevelEditOpen(false)}
        onPick={onChangeLevel}
      />
      {trackEdit ? (
        <CeilingPicker
          track={trackEdit}
          current={ceilings.find((c) => c.track === trackEdit)?.ceiling ?? null}
          onClose={() => setTrackEdit(null)}
          onPick={(g) => onSetCeiling(trackEdit, g)}
          saving={savingTrack === trackEdit}
        />
      ) : null}
    </SafeAreaView>
  );
}

function LevelPicker({
  visible,
  current,
  onClose,
  onPick,
}: {
  visible: boolean;
  current: ProgressionLevel;
  onClose: () => void;
  onPick: (l: ProgressionLevel) => void;
}) {
  const palette = Colors[useColorScheme() ?? 'light'];
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.modalSheet, { backgroundColor: palette.surface }]}
          onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.modalTitle, { color: palette.text }]}>Set animal level</Text>
          {LEVEL_ORDER.map((l) => {
            const selected = l === current;
            return (
              <Pressable
                key={l}
                onPress={() => onPick(l)}
                testID={`level-pick-${l}`}
                style={[
                  styles.modalRow,
                  { borderColor: palette.border },
                  selected && { backgroundColor: palette.background },
                ]}>
                <Text style={{ fontSize: 22 }}>{LEVEL_EMOJI[l]}</Text>
                <Text style={[styles.modalRowLabel, { color: palette.text }]}>
                  {LEVEL_LABEL[l]}
                </Text>
                {selected ? (
                  <Text style={[styles.modalCurrent, { color: palette.muted }]}>Current</Text>
                ) : null}
              </Pressable>
            );
          })}
          <Pressable style={styles.modalCancel} onPress={onClose}>
            <Text style={[styles.modalCancelText, { color: palette.muted }]}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CeilingPicker({
  track,
  current,
  onClose,
  onPick,
  saving,
}: {
  track: Track;
  current: string | null;
  onClose: () => void;
  onPick: (ceiling: string | null) => void;
  saving: boolean;
}) {
  const palette = Colors[useColorScheme() ?? 'light'];
  const grades = TRACK_GRADES[track];
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.modalSheet, { backgroundColor: palette.surface }]}
          onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.modalTitle, { color: palette.text }]}>
            {TRACK_LABEL[track]} — set ceiling
          </Text>
          <ScrollView style={{ maxHeight: 360 }}>
            <Pressable
              onPress={() => onPick(null)}
              testID="ceiling-pick-clear"
              style={[styles.modalRow, { borderColor: palette.border }]}>
              <Text style={{ fontSize: 18 }}>—</Text>
              <Text style={[styles.modalRowLabel, { color: palette.text }]}>Clear ceiling</Text>
              {current == null ? (
                <Text style={[styles.modalCurrent, { color: palette.muted }]}>Current</Text>
              ) : null}
            </Pressable>
            {grades.map((g) => {
              const selected = g === current;
              return (
                <Pressable
                  key={g}
                  onPress={() => onPick(g)}
                  testID={`ceiling-pick-${g}`}
                  style={[
                    styles.modalRow,
                    { borderColor: palette.border },
                    selected && { backgroundColor: palette.background },
                  ]}>
                  <Text style={[styles.modalRowLabel, { color: palette.text }]}>{g}</Text>
                  {selected ? (
                    <Text style={[styles.modalCurrent, { color: palette.muted }]}>Current</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable style={styles.modalCancel} onPress={onClose} disabled={saving}>
            <Text style={[styles.modalCancelText, { color: palette.muted }]}>
              {saving ? 'Saving…' : 'Cancel'}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  name: { fontSize: 20, fontWeight: '700' },
  muted: { fontSize: 12 },
  editCta: { backgroundColor: OtterPalette.slateNavy, borderColor: OtterPalette.slateNavy },
  editCtaText: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  hint: { fontSize: 12, marginHorizontal: 20, marginTop: -4, fontStyle: 'italic' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,26,20,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderRadius: 8,
  },
  modalRowLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  modalCurrent: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  modalCancel: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  modalCancelText: { fontSize: 14, fontWeight: '600' },
});
