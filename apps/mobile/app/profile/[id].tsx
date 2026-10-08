import { router, useLocalSearchParams } from 'expo-router';
import type React from 'react';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  type Ceiling,
  CeilingsCard,
  CurrentLevelCard,
  JourneyLadder,
} from '@/components/progress-blocks';
import { Header } from '@/components/header';
import { PageTitle } from '@/components/page-title';
import { Avatar } from '@/components/photo';
import { ErrorCard, LoadingCenter } from '@/components/screen-states';
import { Card, Pill, Row, SectionTitle } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoadOnFocus } from '@/hooks/use-load-on-focus';
import { logAdminAction } from '@/lib/audit';
import { roleFlags, useAuth } from '@/lib/auth';
import { writeFailure } from '@/lib/errors';
import { EXPERIENCE_QUESTIONS, type ExperienceAnswers, hasAnyAnswer } from '@/lib/experience';
import { emailKey, type ListRow, memberStatus } from '@/lib/membership';
import { MEMBER_STATUS_COLOR, type MemberStatus } from '@/lib/status';
import {
  LEVEL_EMOJI,
  LEVEL_LABEL,
  LEVEL_ORDER,
  type ProgressionLevel,
  type Track,
  TRACK_GRADES,
  TRACK_LABEL,
} from '@/lib/progress';
import { supabase } from '@/lib/supabase';

type ProfileRow = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  level: ProgressionLevel;
  status_override: MemberStatus | null;
  // Worked out from the list — only for membership admins, who can read it.
  status?: MemberStatus;
  created_at: string;
  avatar_path: string | null;
  is_admin: boolean;
  is_membership_admin: boolean;
  is_paddling_admin: boolean;
};

type ApprovalRow = { track: Track; ceiling: string };

type PrivateFields = {
  phone: string;
  dob: string;
  bc_membership_no: string;
};

const EMPTY_PRIVATE: PrivateFields = {
  phone: '',
  dob: '',
  bc_membership_no: '',
};

type Experience = {
  experience_answers: ExperienceAnswers | null;
  experience_review_requested: boolean;
  experience_submitted_at: string | null;
  experience_reviewed_at: string | null;
};

function formatDate(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

type RoleColumn = 'is_admin' | 'is_membership_admin' | 'is_paddling_admin';

const ROLE_DEFS: { column: RoleColumn; label: string }[] = [
  { column: 'is_admin', label: 'Super admin' },
  { column: 'is_membership_admin', label: 'Membership admin' },
  { column: 'is_paddling_admin', label: 'Paddling admin' },
];

export default function MemberProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const palette = Colors[useColorScheme() ?? 'light'];
  const { profile: viewerProfile, session } = useAuth();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [priv, setPriv] = useState<PrivateFields>(EMPTY_PRIVATE);
  const [privForm, setPrivForm] = useState<PrivateFields | null>(null);
  const [savingPriv, setSavingPriv] = useState(false);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [markingReviewed, setMarkingReviewed] = useState(false);
  const [ceilings, setCeilings] = useState<Ceiling[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingLevel, setSavingLevel] = useState(false);
  const [savingTrack, setSavingTrack] = useState<Track | null>(null);
  const [levelEditOpen, setLevelEditOpen] = useState(false);
  const [statusEditOpen, setStatusEditOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [listRow, setListRow] = useState<ListRow | null>(null);
  const [trackEdit, setTrackEdit] = useState<Track | null>(null);
  const [savingRole, setSavingRole] = useState<RoleColumn | null>(null);
  const [confirmSuper, setConfirmSuper] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !session) {
      return;
    }
    setError(null);
    const [profRes, ceilRes] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'id, full_name, display_name, level, status_override, created_at, avatar_path, is_admin, is_membership_admin, is_paddling_admin',
        )
        .eq('id', id)
        .maybeSingle(),
      supabase.from('member_approvals').select('track, ceiling').eq('member_id', id),
    ]);
    if (profRes.error) {
      setError(profRes.error.message);
    }
    setProfile((profRes.data as ProfileRow) ?? null);
    setCeilings(((ceilRes.data ?? []) as ApprovalRow[]).map((r) => ({ ...r })));

    // Membership admins see the member's email and private fields (both
    // gated server-side by RLS / the email RPC).
    if (roleFlags(viewerProfile).membershipAdmin) {
      const [emailRes, privRes] = await Promise.all([
        supabase.rpc('admin_member_emails', { p_member_id: id }),
        supabase
          .from('member_private')
          .select('phone, dob, bc_membership_no')
          .eq('member_id', id)
          .maybeSingle(),
      ]);
      const memberEmail = (emailRes.data as { email: string | null }[] | null)?.[0]?.email ?? null;
      setEmail(memberEmail);
      const { data: listData } = await supabase
        .from('verified_members')
        .select('expires_on')
        .eq('email_norm', emailKey(memberEmail))
        .maybeSingle();
      const listed = (listData as ListRow | null) ?? null;
      setListRow(listed);
      setProfile((p) => (p ? { ...p, status: memberStatus(p.status_override, listed) } : p));
      const p = privRes.data as Partial<PrivateFields> | null;
      setPriv({
        phone: p?.phone ?? '',
        dob: p?.dob ?? '',
        bc_membership_no: p?.bc_membership_no ?? '',
      });
    }

    // The member's self-declared paddling experience, via an RPC that exposes
    // only these fields. Paddling admins (who set the level) see everyone's;
    // a leader sees it for anyone signed up to one of their trips. Anyone
    // else gets no rows back, and the section stays hidden.
    if (session) {
      const { data: expData } = await supabase.rpc('admin_member_experience', {
        p_member_id: id,
      });
      setExperience((expData as Experience[] | null)?.[0] ?? null);
    }
    setLoading(false);
  }, [id, session, viewerProfile]);

  const markReviewed = async () => {
    if (!id) {
      return;
    }
    setMarkingReviewed(true);
    const { error: err } = await supabase.rpc('admin_mark_experience_reviewed', {
      p_member_id: id,
    });
    setMarkingReviewed(false);
    if (err) {
      setError(err.message);
      return;
    }
    setExperience((e) =>
      e
        ? {
            ...e,
            experience_review_requested: false,
            experience_reviewed_at: new Date().toISOString(),
          }
        : e,
    );
    if (session) {
      logAdminAction({
        actorId: session.user.id,
        targetType: 'profile',
        targetId: id,
        action: 'experience_reviewed',
      });
    }
  };

  const savePrivateFields = async () => {
    if (!id || !privForm) {
      return;
    }
    setSavingPriv(true);
    const { data, error: err } = await supabase
      .from('member_private')
      .upsert({
        member_id: id,
        phone: privForm.phone.trim() || null,
        dob: privForm.dob.trim() || null,
        bc_membership_no: privForm.bc_membership_no.trim() || null,
      })
      .select('member_id');
    setSavingPriv(false);
    const failure = writeFailure(err, data);
    if (failure) {
      setError(failure);
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
    const { data, error: err } = await supabase
      .from('profiles')
      .update({ level: next })
      .eq('id', id)
      .select('id');
    setSavingLevel(false);
    const failure = writeFailure(err, data);
    if (failure) {
      setError(failure);
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

  // null clears the override, so status follows the verified-members list again.
  const onChangeStatus = async (next: MemberStatus | null) => {
    if (!id) {
      return;
    }
    setSavingStatus(true);
    const { data, error: err } = await supabase
      .from('profiles')
      .update({ status_override: next })
      .eq('id', id)
      .select('id');
    setSavingStatus(false);
    const failure = writeFailure(err, data);
    if (failure) {
      setError(failure);
    } else {
      setProfile((p) =>
        p ? { ...p, status_override: next, status: memberStatus(next, listRow) } : p,
      );
    }
    setStatusEditOpen(false);
  };

  const onSetCeiling = async (track: Track, ceiling: string | null) => {
    if (!id || !session) {
      return;
    }
    setSavingTrack(track);
    const prev = ceilings.find((c) => c.track === track)?.ceiling ?? null;
    if (ceiling == null) {
      const { data, error: err } = await supabase
        .from('member_approvals')
        .delete()
        .eq('member_id', id)
        .eq('track', track)
        .select('track');
      // Clearing an already-unset ceiling deletes nothing and that's correct,
      // so only demand a row back when there was one to remove.
      const failure = prev ? writeFailure(err, data) : (err?.message ?? null);
      if (failure) {
        setError(failure);
      } else {
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
      const { data, error: err } = await supabase
        .from('member_approvals')
        .upsert({
          member_id: id,
          track,
          ceiling,
          set_by: session.user.id,
          set_at: new Date().toISOString(),
        })
        .select('track');
      const failure = writeFailure(err, data);
      if (failure) {
        setError(failure);
      } else {
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

  const onToggleRole = async (column: RoleColumn) => {
    if (!id) {
      return;
    }
    // Granting/revoking super admin is the most privileged — confirm it.
    if (column === 'is_admin' && !confirmSuper) {
      setConfirmSuper(true);
      return;
    }
    const next = !profile?.[column];
    setSavingRole(column);
    const { data, error: err } = await supabase
      .from('profiles')
      .update({ [column]: next })
      .eq('id', id)
      .select('id');
    setSavingRole(null);
    setConfirmSuper(false);
    const failure = writeFailure(err, data);
    if (failure) {
      setError(failure);
    } else {
      setProfile((p) => (p ? { ...p, [column]: next } : p));
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
  const roles = roleFlags(viewerProfile);
  // Paddling admins manage progression (level + ceilings); membership admins
  // manage member data (status, email, private fields); super admins
  // manage role grants. Never on your own record.
  const canPaddling = roles.paddlingAdmin && !isSelf;
  const canMembership = roles.membershipAdmin && !isSelf;
  const canRoles = roles.superAdmin && !isSelf;
  // Level is the one control a paddling/super admin may change on their own
  // record (e.g. a Selkie self-promoting). Other controls stay non-self.
  const canEditLevel = roles.paddlingAdmin;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
      <PageTitle title={name} />
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
                  testID="profile-level-pill"
                  label={`${levelEmoji} ${LEVEL_LABEL[profile.level]}`}
                  color={OtterPalette.slateNavy}
                />
                {profile.status ? (
                  <Pill
                    label={profile.status}
                    color={MEMBER_STATUS_COLOR[profile.status] ?? OtterPalette.lochPool}
                  />
                ) : null}
              </Row>
            </View>
          </Row>
        </Card>

        {error ? <ErrorCard title={error} /> : null}

        <SectionTitle>Current level</SectionTitle>
        <CurrentLevelCard level={profile.level} createdAt={profile.created_at} />
        {canEditLevel ? (
          <Pressable
            accessibilityRole="button"
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

        {experience &&
        (hasAnyAnswer(experience.experience_answers) ||
          (canEditLevel && experience.experience_review_requested)) ? (
          <>
            <SectionTitle>Paddling experience</SectionTitle>
            <Card>
              <Row style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {experience.experience_review_requested ? (
                  <Pill label="Review requested" color={OtterPalette.burntOrange} />
                ) : experience.experience_reviewed_at ? (
                  <Pill label="Reviewed" color={OtterPalette.forest} />
                ) : null}
                {experience.experience_submitted_at ? (
                  <Text style={[styles.muted, { color: palette.muted }]}>
                    {`Submitted ${formatDate(experience.experience_submitted_at)}`}
                  </Text>
                ) : null}
              </Row>
              {hasAnyAnswer(experience.experience_answers) ? (
                EXPERIENCE_QUESTIONS.filter(
                  (q) => (experience.experience_answers?.[q.key] ?? '').trim().length > 0,
                ).map((q) => (
                  <View key={q.key} style={{ marginTop: 12 }}>
                    <Text style={[styles.fieldLabel, { color: palette.muted }]}>{q.label}</Text>
                    <Text
                      style={[styles.muted, { color: palette.text, fontSize: 14, lineHeight: 20 }]}
                    >
                      {experience.experience_answers?.[q.key]}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={[styles.muted, { color: palette.muted, fontSize: 14, marginTop: 10 }]}>
                  No answers written yet.
                </Text>
              )}
              {canEditLevel && experience.experience_review_requested ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={markingReviewed ? undefined : markReviewed}
                  disabled={markingReviewed}
                  testID="mark-reviewed-cta"
                  style={[styles.editCta, styles.btnPad, { marginTop: 12 }]}
                >
                  <Text style={styles.editCtaText}>
                    {markingReviewed ? 'Saving…' : 'Mark as reviewed'}
                  </Text>
                </Pressable>
              ) : null}
            </Card>
          </>
        ) : null}

        {canMembership && profile.status ? (
          <>
            <SectionTitle>Membership status</SectionTitle>
            <Card>
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.muted, { color: palette.text, flex: 1 }]}>
                  {profile.status_override
                    ? `${name} is currently ${profile.status}, set by an admin.`
                    : `${name} is currently ${profile.status}, from the members list.`}
                </Text>
                <Pill
                  label={profile.status}
                  color={
                    MEMBER_STATUS_COLOR[profile.status as MemberStatus] ?? OtterPalette.lochPool
                  }
                />
              </Row>
              <Pressable
                accessibilityRole="button"
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

        {canMembership ? (
          <>
            <SectionTitle>Personal</SectionTitle>
            <Card>
              {privForm ? (
                <>
                  <FieldRow palette={palette} label="Phone">
                    <TextInput
                      value={privForm.phone}
                      accessibilityLabel="Phone"
                      onChangeText={(v) => setPrivForm({ ...privForm, phone: v })}
                      keyboardType="phone-pad"
                      placeholderTextColor={palette.muted}
                      style={[styles.input, { color: palette.text, borderColor: palette.border }]}
                    />
                  </FieldRow>
                  <FieldRow palette={palette} label="Date of birth (YYYY-MM-DD)">
                    <TextInput
                      value={privForm.dob}
                      accessibilityLabel="Date of birth"
                      onChangeText={(v) => setPrivForm({ ...privForm, dob: v })}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={palette.muted}
                      style={[styles.input, { color: palette.text, borderColor: palette.border }]}
                    />
                  </FieldRow>
                  <FieldRow palette={palette} label="BC membership no.">
                    <TextInput
                      value={privForm.bc_membership_no}
                      accessibilityLabel="BC membership number"
                      onChangeText={(v) => setPrivForm({ ...privForm, bc_membership_no: v })}
                      placeholderTextColor={palette.muted}
                      style={[styles.input, { color: palette.text, borderColor: palette.border }]}
                    />
                  </FieldRow>
                  <Row style={{ gap: 8, marginTop: 12 }}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={savingPriv ? undefined : savePrivateFields}
                      disabled={savingPriv}
                      testID="save-private-cta"
                      style={[styles.editCta, styles.btnPad, { flex: 1 }]}
                    >
                      <Text style={styles.editCtaText}>{savingPriv ? 'Saving…' : 'Save'}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
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
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setPrivForm(priv)}
                    testID="edit-private-cta"
                    style={[styles.editCta, styles.btnPad, { marginTop: 12 }]}
                  >
                    <Text style={styles.editCtaText}>Edit personal details</Text>
                  </Pressable>
                </>
              )}
            </Card>
          </>
        ) : null}

        <SectionTitle>Approval ceiling</SectionTitle>
        <CeilingsCard
          ceilings={ceilings}
          onPressTrack={canPaddling ? (t) => setTrackEdit(t) : undefined}
        />
        {canPaddling ? (
          <Text style={[styles.hint, { color: palette.muted }]}>
            Tap a track to set or clear the ceiling.
          </Text>
        ) : null}

        <SectionTitle>The journey</SectionTitle>
        <JourneyLadder level={profile.level} />

        {canRoles ? (
          <>
            <SectionTitle>Admin roles</SectionTitle>
            <Card>
              {ROLE_DEFS.map(({ column, label }, i) => {
                const on = !!profile[column];
                const saving = savingRole === column;
                const confirming = column === 'is_admin' && confirmSuper;
                return (
                  <View key={column} style={{ marginTop: i === 0 ? 0 : 14 }}>
                    <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[styles.muted, { color: palette.text, flex: 1 }]}>{label}</Text>
                      <Pill
                        label={on ? 'On' : 'Off'}
                        color={on ? OtterPalette.slateNavy : palette.surface}
                        textStyle={on ? undefined : { color: palette.muted }}
                      />
                    </Row>
                    <Pressable
                      accessibilityRole="button"
                      onPress={saving ? undefined : () => onToggleRole(column)}
                      disabled={saving}
                      testID={`toggle-role-${column}`}
                      style={[
                        styles.editCta,
                        styles.btnPad,
                        {
                          marginTop: 8,
                          backgroundColor: confirming ? OtterPalette.ice : OtterPalette.slateNavy,
                        },
                      ]}
                    >
                      <Text style={styles.editCtaText}>
                        {saving
                          ? 'Saving…'
                          : confirming
                            ? 'Tap again to confirm'
                            : on
                              ? `Revoke ${label.toLowerCase()}`
                              : `Grant ${label.toLowerCase()}`}
                      </Text>
                    </Pressable>
                    {confirming ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setConfirmSuper(false)}
                        style={{ marginTop: 8, alignItems: 'center' }}
                      >
                        <Text style={[styles.hint, { color: palette.muted }]}>Cancel</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
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
        current={profile.status_override}
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
      <Pressable accessibilityRole="button" style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          accessibilityRole="button"
          style={[styles.modalSheet, { backgroundColor: palette.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.modalTitle, { color: palette.text }]}>Set animal level</Text>
          {LEVEL_ORDER.map((l) => {
            const selected = l === current;
            return (
              <Pressable
                accessibilityState={{ selected: selected }}
                accessibilityRole="button"
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
          <Pressable accessibilityRole="button" style={styles.modalCancel} onPress={onClose}>
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
  current: MemberStatus | null;
  onClose: () => void;
  onPick: (s: MemberStatus | null) => void;
}) {
  const palette = Colors[useColorScheme() ?? 'light'];
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable accessibilityRole="button" style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          accessibilityRole="button"
          style={[styles.modalSheet, { backgroundColor: palette.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.modalTitle, { color: palette.text }]}>Set membership status</Text>
          <Pressable
            accessibilityState={{ selected: current === null }}
            accessibilityRole="button"
            onPress={() => onPick(null)}
            testID="status-pick-list"
            style={[
              styles.modalRow,
              { borderColor: palette.border },
              current === null && { backgroundColor: palette.background },
            ]}
          >
            <Text style={[styles.modalRowLabel, { color: palette.text }]}>
              Follow the members list
            </Text>
            {current === null ? (
              <Text style={[styles.modalCurrent, { color: palette.muted }]}>Current</Text>
            ) : null}
          </Pressable>
          {MEMBER_STATUSES.map((s) => {
            const selected = s === current;
            return (
              <Pressable
                accessibilityState={{ selected: selected }}
                accessibilityRole="button"
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
          <Pressable accessibilityRole="button" style={styles.modalCancel} onPress={onClose}>
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
      <Pressable accessibilityRole="button" style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          accessibilityRole="button"
          style={[styles.modalSheet, { backgroundColor: palette.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.modalTitle, { color: palette.text }]}>
            {TRACK_LABEL[track]} — set ceiling
          </Text>
          <ScrollView style={{ maxHeight: 360 }}>
            <Pressable
              accessibilityRole="button"
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
                  accessibilityState={{ selected: selected }}
                  accessibilityRole="button"
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
          <Pressable
            accessibilityRole="button"
            style={styles.modalCancel}
            onPress={onClose}
            disabled={saving}
          >
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
