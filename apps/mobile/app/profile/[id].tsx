import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { logAdminAction } from '@/lib/audit';
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
  is_admin: boolean;
};

type ApprovalRow = { track: Track; ceiling: string };

type PrivateFields = {
  phone: string;
  dob: string;
  bc_membership_no: string;
  medical_notes: string;
};

type EmergencyContact = {
  id: string;
  name: string;
  relationship: string | null;
  phone: string;
  email: string | null;
  is_primary: boolean;
};

const EMPTY_PRIVATE: PrivateFields = {
  phone: '',
  dob: '',
  bc_membership_no: '',
  medical_notes: '',
};

export default function MemberProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const palette = Colors[useColorScheme() ?? 'light'];
  const { profile: viewerProfile, session } = useAuth();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [priv, setPriv] = useState<PrivateFields>(EMPTY_PRIVATE);
  const [privForm, setPrivForm] = useState<PrivateFields | null>(null);
  const [savingPriv, setSavingPriv] = useState(false);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [ceilings, setCeilings] = useState<Ceiling[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingLevel, setSavingLevel] = useState(false);
  const [savingTrack, setSavingTrack] = useState<Track | null>(null);
  const [levelEditOpen, setLevelEditOpen] = useState(false);
  const [statusEditOpen, setStatusEditOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [trackEdit, setTrackEdit] = useState<Track | null>(null);
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [confirmAdmin, setConfirmAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !session) {
      return;
    }
    setError(null);
    const [profRes, ceilRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, display_name, level, status, created_at, avatar_path, is_admin')
        .eq('id', id)
        .maybeSingle(),
      supabase.from('member_approvals').select('track, ceiling').eq('member_id', id),
    ]);
    if (profRes.error) {
      setError(profRes.error.message);
    }
    setProfile((profRes.data as ProfileRow) ?? null);
    setCeilings(((ceilRes.data ?? []) as ApprovalRow[]).map((r) => ({ ...r })));

    // Admins see the member's email, private fields and emergency contacts
    // (all gated server-side by RLS / the email RPC).
    if (viewerProfile?.is_admin) {
      const [emailRes, privRes, contactRes] = await Promise.all([
        supabase.rpc('admin_member_emails', { p_member_id: id }),
        supabase
          .from('member_private')
          .select('phone, dob, bc_membership_no, medical_notes')
          .eq('member_id', id)
          .maybeSingle(),
        supabase
          .from('emergency_contacts')
          .select('id, name, relationship, phone, email, is_primary')
          .eq('member_id', id)
          .order('is_primary', { ascending: false }),
      ]);
      setEmail((emailRes.data as { email: string | null }[] | null)?.[0]?.email ?? null);
      const p = privRes.data as Partial<PrivateFields> | null;
      setPriv({
        phone: p?.phone ?? '',
        dob: p?.dob ?? '',
        bc_membership_no: p?.bc_membership_no ?? '',
        medical_notes: p?.medical_notes ?? '',
      });
      setContacts((contactRes.data ?? []) as EmergencyContact[]);
    }
    setLoading(false);
  }, [id, session, viewerProfile?.is_admin]);

  const savePrivateFields = async () => {
    if (!id || !privForm) {
      return;
    }
    setSavingPriv(true);
    const { error: err } = await supabase.from('member_private').upsert({
      member_id: id,
      phone: privForm.phone.trim() || null,
      dob: privForm.dob.trim() || null,
      bc_membership_no: privForm.bc_membership_no.trim() || null,
      medical_notes: privForm.medical_notes.trim() || null,
    });
    setSavingPriv(false);
    if (err) {
      setError(err.message);
    } else {
      setPriv(privForm);
      setPrivForm(null);
      if (session) {
        // Action only — never store the sensitive values themselves.
        logAdminAction({
          actorId: session.user.id,
          targetType: 'profile',
          targetId: id,
          action: 'private_fields',
        });
      }
    }
  };

  useLoadOnFocus(load);

  const onChangeLevel = async (next: ProgressionLevel) => {
    if (!id) {
      return;
    }
    setSavingLevel(true);
    const prev = profile?.level ?? null;
    const { error: err } = await supabase.from('profiles').update({ level: next }).eq('id', id);
    setSavingLevel(false);
    if (err) {
      setError(err.message);
    } else {
      setProfile((p) => (p ? { ...p, level: next } : p));
      if (session) {
        logAdminAction({
          actorId: session.user.id,
          targetType: 'profile',
          targetId: id,
          action: 'level',
          before: prev,
          after: next,
        });
      }
    }
    setLevelEditOpen(false);
  };

  const onChangeStatus = async (next: MemberStatus) => {
    if (!id) {
      return;
    }
    setSavingStatus(true);
    const { error: err } = await supabase.from('profiles').update({ status: next }).eq('id', id);
    setSavingStatus(false);
    if (err) {
      setError(err.message);
    } else {
      setProfile((p) => (p ? { ...p, status: next } : p));
    }
    setStatusEditOpen(false);
  };

  const onSetCeiling = async (track: Track, ceiling: string | null) => {
    if (!id || !session) {
      return;
    }
    setSavingTrack(track);
    if (ceiling == null) {
      const { error: err } = await supabase
        .from('member_approvals')
        .delete()
        .eq('member_id', id)
        .eq('track', track);
      if (err) {
        setError(err.message);
      } else {
        const prev = ceilings.find((c) => c.track === track)?.ceiling ?? null;
        setCeilings((cs) => cs.filter((c) => c.track !== track));
        logAdminAction({
          actorId: session.user.id,
          targetType: 'profile',
          targetId: id,
          action: `ceiling:${track}`,
          before: prev,
          after: null,
        });
      }
    } else {
      const { error: err } = await supabase.from('member_approvals').upsert({
        member_id: id,
        track,
        ceiling,
        set_by: session.user.id,
        set_at: new Date().toISOString(),
      });
      if (err) {
        setError(err.message);
      } else {
        const prev = ceilings.find((c) => c.track === track)?.ceiling ?? null;
        setCeilings((cs) => {
          const others = cs.filter((c) => c.track !== track);
          return [...others, { track, ceiling }];
        });
        logAdminAction({
          actorId: session.user.id,
          targetType: 'profile',
          targetId: id,
          action: `ceiling:${track}`,
          before: prev,
          after: ceiling,
        });
      }
    }
    setSavingTrack(null);
    setTrackEdit(null);
  };

  const onToggleAdmin = async () => {
    if (!id) {
      return;
    }
    // Privileged action — require a second tap to confirm.
    if (!confirmAdmin) {
      setConfirmAdmin(true);
      return;
    }
    const next = !profile?.is_admin;
    setSavingAdmin(true);
    const { error: err } = await supabase.from('profiles').update({ is_admin: next }).eq('id', id);
    setSavingAdmin(false);
    setConfirmAdmin(false);
    if (err) {
      setError(err.message);
    } else {
      setProfile((p) => (p ? { ...p, is_admin: next } : p));
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: palette.background }]}
        edges={['top']}
      >
        <Header onBack={() => router.back()} />
        <LoadingCenter />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: palette.background }]}
        edges={['top']}
      >
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
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
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
              {email ? (
                <Text style={[styles.muted, { color: palette.muted, marginTop: 2 }]}>{email}</Text>
              ) : null}
              <Row style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <Pill
                  label={`${levelEmoji} ${LEVEL_LABEL[profile.level]}`}
                  color={OtterPalette.slateNavy}
                />
                <Pill
                  label={profile.status}
                  color={
                    MEMBER_STATUS_COLOR[profile.status as MemberStatus] ?? OtterPalette.lochPool
                  }
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
            testID="change-level-cta"
          >
            <Card style={styles.editCta}>
              <Text style={styles.editCtaText}>
                {savingLevel ? 'Saving…' : 'Change animal level'}
              </Text>
            </Card>
          </Pressable>
        ) : null}

        {canEdit ? (
          <>
            <SectionTitle>Membership status</SectionTitle>
            <Card>
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.muted, { color: palette.text, flex: 1 }]}>
                  {`${name} is currently ${profile.status}.`}
                </Text>
                <Pill
                  label={profile.status}
                  color={
                    MEMBER_STATUS_COLOR[profile.status as MemberStatus] ?? OtterPalette.lochPool
                  }
                />
              </Row>
              <Pressable
                onPress={() => setStatusEditOpen(true)}
                disabled={savingStatus}
                testID="change-status-cta"
                style={[
                  styles.editCta,
                  {
                    marginTop: 12,
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                  },
                ]}
              >
                <Text style={styles.editCtaText}>
                  {savingStatus ? 'Saving…' : 'Change membership status'}
                </Text>
              </Pressable>
            </Card>
          </>
        ) : null}

        {canEdit ? (
          <>
            <SectionTitle>Personal & medical</SectionTitle>
            <Card>
              {privForm ? (
                <>
                  <FieldRow palette={palette} label="Phone">
                    <TextInput
                      value={privForm.phone}
                      onChangeText={(v) => setPrivForm({ ...privForm, phone: v })}
                      keyboardType="phone-pad"
                      placeholderTextColor={palette.muted}
                      style={[styles.input, { color: palette.text, borderColor: palette.border }]}
                    />
                  </FieldRow>
                  <FieldRow palette={palette} label="Date of birth (YYYY-MM-DD)">
                    <TextInput
                      value={privForm.dob}
                      onChangeText={(v) => setPrivForm({ ...privForm, dob: v })}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={palette.muted}
                      style={[styles.input, { color: palette.text, borderColor: palette.border }]}
                    />
                  </FieldRow>
                  <FieldRow palette={palette} label="BC membership no.">
                    <TextInput
                      value={privForm.bc_membership_no}
                      onChangeText={(v) => setPrivForm({ ...privForm, bc_membership_no: v })}
                      placeholderTextColor={palette.muted}
                      style={[styles.input, { color: palette.text, borderColor: palette.border }]}
                    />
                  </FieldRow>
                  <FieldRow palette={palette} label="Medical notes">
                    <TextInput
                      value={privForm.medical_notes}
                      onChangeText={(v) => setPrivForm({ ...privForm, medical_notes: v })}
                      multiline
                      placeholderTextColor={palette.muted}
                      style={[
                        styles.input,
                        { color: palette.text, borderColor: palette.border, minHeight: 72 },
                      ]}
                    />
                  </FieldRow>
                  <Row style={{ gap: 8, marginTop: 12 }}>
                    <Pressable
                      onPress={savingPriv ? undefined : savePrivateFields}
                      disabled={savingPriv}
                      testID="save-private-cta"
                      style={[styles.editCta, styles.btnPad, { flex: 1 }]}
                    >
                      <Text style={styles.editCtaText}>{savingPriv ? 'Saving…' : 'Save'}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setPrivForm(null)}
                      style={[styles.btnPad, { flex: 1, alignItems: 'center' }]}
                    >
                      <Text style={[styles.editCtaText, { color: palette.muted }]}>Cancel</Text>
                    </Pressable>
                  </Row>
                </>
              ) : (
                <>
                  <ReadRow palette={palette} label="Phone" value={priv.phone || '—'} />
                  <ReadRow palette={palette} label="Date of birth" value={priv.dob || '—'} />
                  <ReadRow
                    palette={palette}
                    label="BC membership no."
                    value={priv.bc_membership_no || '—'}
                  />
                  <ReadRow
                    palette={palette}
                    label="Medical notes"
                    value={priv.medical_notes || 'None recorded'}
                  />
                  <Pressable
                    onPress={() => setPrivForm(priv)}
                    testID="edit-private-cta"
                    style={[styles.editCta, styles.btnPad, { marginTop: 12 }]}
                  >
                    <Text style={styles.editCtaText}>Edit personal & medical</Text>
                  </Pressable>
                </>
              )}
            </Card>

            <SectionTitle>Emergency contacts</SectionTitle>
            <Card>
              {contacts.length === 0 ? (
                <Text style={[styles.muted, { color: palette.muted }]}>None recorded</Text>
              ) : (
                contacts.map((c) => (
                  <View key={c.id} style={{ marginBottom: 10 }}>
                    <Row style={{ gap: 6, alignItems: 'center' }}>
                      <Text style={[styles.name, { color: palette.text, fontSize: 15 }]}>
                        {c.name}
                      </Text>
                      {c.is_primary ? (
                        <Pill label="Primary" color={OtterPalette.slateNavy} />
                      ) : null}
                    </Row>
                    {c.relationship ? (
                      <Text style={[styles.muted, { color: palette.muted }]}>{c.relationship}</Text>
                    ) : null}
                    <Text style={[styles.muted, { color: palette.text }]}>{c.phone}</Text>
                    {c.email ? (
                      <Text style={[styles.muted, { color: palette.muted }]}>{c.email}</Text>
                    ) : null}
                  </View>
                ))
              )}
            </Card>
          </>
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

        {canEdit ? (
          <>
            <SectionTitle>Admin rights</SectionTitle>
            <Card>
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.muted, { color: palette.text, flex: 1 }]}>
                  {profile.is_admin
                    ? `${name} is an admin and can manage members and events.`
                    : `${name} is not an admin.`}
                </Text>
                <Pill
                  label={profile.is_admin ? 'Admin' : 'Member'}
                  color={profile.is_admin ? OtterPalette.slateNavy : palette.surface}
                  textStyle={profile.is_admin ? undefined : { color: palette.muted }}
                />
              </Row>
              <Pressable
                onPress={savingAdmin ? undefined : onToggleAdmin}
                disabled={savingAdmin}
                testID="toggle-admin-cta"
                style={[
                  styles.editCta,
                  {
                    marginTop: 12,
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    backgroundColor: confirmAdmin ? OtterPalette.ice : OtterPalette.slateNavy,
                  },
                ]}
              >
                <Text style={styles.editCtaText}>
                  {savingAdmin
                    ? 'Saving…'
                    : confirmAdmin
                      ? 'Tap again to confirm'
                      : profile.is_admin
                        ? 'Revoke admin'
                        : 'Make admin'}
                </Text>
              </Pressable>
              {confirmAdmin ? (
                <Pressable
                  onPress={() => setConfirmAdmin(false)}
                  style={{ marginTop: 8, alignItems: 'center' }}
                >
                  <Text style={[styles.hint, { color: palette.muted }]}>Cancel</Text>
                </Pressable>
              ) : null}
            </Card>
          </>
        ) : null}
      </ScrollView>

      <LevelPicker
        visible={levelEditOpen}
        current={profile.level}
        onClose={() => setLevelEditOpen(false)}
        onPick={onChangeLevel}
      />
      <StatusPicker
        visible={statusEditOpen}
        current={profile.status}
        onClose={() => setStatusEditOpen(false)}
        onPick={onChangeStatus}
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

function ReadRow({
  palette,
  label,
  value,
}: {
  palette: typeof Colors.light;
  label: string;
  value: string;
}) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={[styles.fieldLabel, { color: palette.muted }]}>{label}</Text>
      <Text style={[styles.muted, { color: palette.text, fontSize: 14 }]}>{value}</Text>
    </View>
  );
}

function FieldRow({
  palette,
  label,
  children,
}: {
  palette: typeof Colors.light;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={[styles.fieldLabel, { color: palette.muted }]}>{label}</Text>
      {children}
    </View>
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
          onPress={(e) => e.stopPropagation()}
        >
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
                ]}
              >
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

const MEMBER_STATUSES: MemberStatus[] = ['active', 'aspirant', 'lapsed', 'suspended'];

function StatusPicker({
  visible,
  current,
  onClose,
  onPick,
}: {
  visible: boolean;
  current: MemberStatus;
  onClose: () => void;
  onPick: (s: MemberStatus) => void;
}) {
  const palette = Colors[useColorScheme() ?? 'light'];
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.modalSheet, { backgroundColor: palette.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.modalTitle, { color: palette.text }]}>Set membership status</Text>
          {MEMBER_STATUSES.map((s) => {
            const selected = s === current;
            return (
              <Pressable
                key={s}
                onPress={() => onPick(s)}
                testID={`status-pick-${s}`}
                style={[
                  styles.modalRow,
                  { borderColor: palette.border },
                  selected && { backgroundColor: palette.background },
                ]}
              >
                <View style={[styles.statusDot, { backgroundColor: MEMBER_STATUS_COLOR[s] }]} />
                <Text style={[styles.modalRowLabel, { color: palette.text }]}>{s}</Text>
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
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.modalTitle, { color: palette.text }]}>
            {TRACK_LABEL[track]} — set ceiling
          </Text>
          <ScrollView style={{ maxHeight: 360 }}>
            <Pressable
              onPress={() => onPick(null)}
              testID="ceiling-pick-clear"
              style={[styles.modalRow, { borderColor: palette.border }]}
            >
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
                  ]}
                >
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
  modalRowLabel: { flex: 1, fontSize: 15, fontWeight: '600', textTransform: 'capitalize' },
  statusDot: { width: 14, height: 14, borderRadius: 7 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  btnPad: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12 },
  modalCurrent: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  modalCancel: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  modalCancelText: { fontSize: 14, fontWeight: '600' },
});
