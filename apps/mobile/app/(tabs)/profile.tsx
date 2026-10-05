import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Constants from 'expo-constants';
import { ManageMembersCard } from '@/components/admin-card';
import { MembershipBanner } from '@/components/membership-banner';
import { PageTitle } from '@/components/page-title';
import { Avatar } from '@/components/photo';
import { ErrorCard, LoadingCenter } from '@/components/screen-states';
import { Card, Pill, Row, SectionTitle, TopBar } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoadOnFocus } from '@/hooks/use-load-on-focus';
import { roleFlags, useAuth } from '@/lib/auth';
import { readErrorMessage, writeFailure } from '@/lib/errors';
import {
  cleanAnswers,
  EXPERIENCE_QUESTIONS,
  type ExperienceAnswers,
  hasAnyAnswer,
} from '@/lib/experience';
import { pickImage, removePhoto, uploadPhoto } from '@/lib/photos';
import { LEVEL_EMOJI, LEVEL_LABEL } from '@/lib/progress';
import { MEMBER_STATUS_COLOR, type MemberStatus } from '@/lib/status';
import { supabase } from '@/lib/supabase';

type ProfileFields = {
  full_name: string;
  display_name: string;
  phone: string;
  dob: string;
  bc_membership_no: string;
};

function formatDob(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatSubmitted(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isValidDob(s: string): boolean {
  if (!s) {
    return true;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}

const appVersion = Constants.expoConfig?.version ?? '';

export default function ProfileScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const { session, profile, refreshProfile } = useAuth();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProfileFields | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Paddling-experience summary (own section, saved separately from the
  // personal-details form so the review flow stays self-contained).
  const [expEditing, setExpEditing] = useState(false);
  const [expDraft, setExpDraft] = useState<ExperienceAnswers>({});
  const [savingExp, setSavingExp] = useState(false);
  const [requestingReview, setRequestingReview] = useState(false);

  // Arriving from a trip's "tell us your experience" link: open the form,
  // and once saved send them back to the trip so they can ask the leader.
  // Only same-app event paths are honoured as a return target.
  const { editExperience, returnTo } = useLocalSearchParams<{
    editExperience?: string;
    returnTo?: string;
  }>();
  const tripReturn = returnTo?.startsWith('/event/') ? returnTo : null;
  const scrollRef = useRef<ScrollView>(null);
  const experienceY = useRef(0);
  useEffect(() => {
    if (editExperience === '1' && profile) {
      setExpDraft({ ...(profile.experience_answers ?? {}) });
      setExpEditing(true);
      router.setParams({ editExperience: undefined });
      // Wait a frame for the section to lay out, then bring the form into view.
      setTimeout(() => scrollRef.current?.scrollTo({ y: experienceY.current, animated: true }), 50);
    }
  }, [editExperience, profile]);

  const { refreshing, onRefresh } = useLoadOnFocus(refreshProfile);

  const onChangeAvatar = async () => {
    if (!session) {
      return;
    }
    const asset = await pickImage();
    if (!asset) {
      return;
    }
    setError(null);
    setUploadingAvatar(true);
    const previousPath = profile?.avatar_path ?? null;
    const result = await uploadPhoto('avatars', session.user.id, asset);
    if ('error' in result) {
      setError(`Avatar upload failed: ${result.error}`);
      setUploadingAvatar(false);
      return;
    }
    const { data: updated, error: updateErr } = await supabase
      .from('profiles')
      .update({ avatar_path: result.path })
      .eq('id', session.user.id)
      .select('id');
    const updateFailure = writeFailure(updateErr, updated);
    if (updateFailure) {
      setError(updateFailure);
      // The row still points at the old avatar, so bin the orphan we uploaded.
      await removePhoto('avatars', result.path);
      setUploadingAvatar(false);
      return;
    }
    if (previousPath && previousPath !== result.path) {
      await removePhoto('avatars', previousPath);
    }
    await refreshProfile();
    setUploadingAvatar(false);
  };

  const beginEdit = () => {
    if (!profile) {
      return;
    }
    setForm({
      full_name: profile.full_name ?? '',
      display_name: profile.display_name ?? '',
      phone: profile.phone ?? '',
      dob: profile.dob ?? '',
      bc_membership_no: profile.bc_membership_no ?? '',
    });
    setEditing(true);
  };

  const saveProfile = async () => {
    if (!form || !session) {
      return;
    }
    if (!isValidDob(form.dob)) {
      setError('Date of birth must be YYYY-MM-DD');
      return;
    }
    setError(null);
    setSavingProfile(true);
    // Public fields on profiles; sensitive fields on member_private.
    const { data: profRows, error: profErr } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name.trim() || null,
        display_name: form.display_name.trim() || null,
      })
      .eq('id', session.user.id)
      .select('id');
    const { data: privRows, error: privErr } = await supabase
      .from('member_private')
      .upsert({
        member_id: session.user.id,
        phone: form.phone.trim() || null,
        dob: form.dob.trim() || null,
        bc_membership_no: form.bc_membership_no.trim() || null,
      })
      .select('member_id');
    setSavingProfile(false);
    const failure = writeFailure(profErr, profRows) ?? writeFailure(privErr, privRows);
    if (failure) {
      setError(failure);
      return;
    }
    await refreshProfile();
    setEditing(false);
  };

  const beginEditExperience = () => {
    setExpDraft({ ...(profile?.experience_answers ?? {}) });
    setExpEditing(true);
    setError(null);
  };

  const saveExperience = async () => {
    if (!session) {
      return;
    }
    setError(null);
    setSavingExp(true);
    const cleaned = cleanAnswers(expDraft);
    const { data, error: err } = await supabase
      .from('member_private')
      .upsert({
        member_id: session.user.id,
        experience_answers: hasAnyAnswer(cleaned) ? cleaned : null,
      })
      .select('member_id');
    setSavingExp(false);
    const failure = writeFailure(err, data);
    if (failure) {
      setError(failure);
      return;
    }
    await refreshProfile();
    setExpEditing(false);
    if (tripReturn && hasAnyAnswer(cleaned)) {
      // Saving from a trip also sends the request, so the member can't save,
      // land back on the trip and miss that there was a second step. Below
      // the minimum level the server routes this to the leader's review
      // queue, never to payment, so no return_url is needed.
      setSavingExp(true);
      const { error: signUpErr } = await supabase.functions.invoke('sign-up', {
        body: { event_id: tripReturn.slice('/event/'.length) },
      });
      setSavingExp(false);
      if (signUpErr) {
        // Experience is saved; the trip's "Ask the leader" button can retry.
        setError(await readErrorMessage(signUpErr));
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        return;
      }
      router.setParams({ returnTo: undefined });
      router.push(tripReturn as never);
    }
  };

  const requestReview = async () => {
    if (!session) {
      return;
    }
    setError(null);
    setRequestingReview(true);
    // Upsert only the request flag + timestamp; PostgREST's ON CONFLICT
    // updates just these columns, so phone etc. are left intact.
    const { data, error: err } = await supabase
      .from('member_private')
      .upsert({
        member_id: session.user.id,
        experience_review_requested: true,
        experience_submitted_at: new Date().toISOString(),
      })
      .select('member_id');
    setRequestingReview(false);
    const failure = writeFailure(err, data);
    if (failure) {
      setError(failure);
      return;
    }
    await refreshProfile();
  };

  if (!profile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }} edges={['top']}>
        <TopBar title="Profile" subtitle="Your details and settings" />
        <LoadingCenter />
      </SafeAreaView>
    );
  }

  const email = session?.user?.email ?? '—';
  const headlineName = profile.display_name || profile.full_name || email;
  const levelEmoji = LEVEL_EMOJI[profile.level];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }} edges={['top']}>
      <PageTitle title="Profile" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <TopBar title="Profile" subtitle="Your details and settings" />

          <MembershipBanner />

          <Card>
            <Row style={{ gap: 14 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change profile photo"
                accessibilityState={{ busy: uploadingAvatar }}
                onPress={uploadingAvatar ? undefined : onChangeAvatar}
                testID="profile-change-avatar"
                style={{ position: 'relative' }}
              >
                <Avatar path={profile.avatar_path} size={64} fallback={levelEmoji} />
                <View style={styles.avatarBadge}>
                  {uploadingAvatar ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.avatarBadgeText}>✎</Text>
                  )}
                </View>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: palette.text }]}>{headlineName}</Text>
                <Text style={[styles.email, { color: palette.muted }]}>{email}</Text>
                <Row style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`${LEVEL_LABEL[profile.level]} — about paddling levels`}
                    onPress={() => router.push('/levels')}
                    testID="profile-level-pill"
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                  >
                    {/* Outlined, unlike the status pills beside it, so it reads as tappable. */}
                    <Pill
                      label={`${levelEmoji} ${LEVEL_LABEL[profile.level]} ›`}
                      color="transparent"
                      style={[styles.levelPill, { borderColor: palette.tint }]}
                      textStyle={{ color: palette.tint }}
                    />
                  </Pressable>
                  <Pill
                    label={profile.status}
                    color={
                      MEMBER_STATUS_COLOR[profile.status as MemberStatus] ?? OtterPalette.lochPool
                    }
                  />
                  {roleFlags(profile).anyAdmin ? (
                    <Pill label="Admin" color={OtterPalette.burntOrange} />
                  ) : null}
                </Row>
              </View>
            </Row>
          </Card>

          {error ? <ErrorCard title={error} /> : null}

          {roleFlags(profile).anyAdmin ? <ManageMembersCard /> : null}

          <SectionTitle>Personal details</SectionTitle>
          {editing && form ? (
            <Card>
              <FormField
                label="Full name"
                value={form.full_name}
                onChangeText={(v) => setForm({ ...form, full_name: v })}
                placeholder="Your legal name"
              />
              <FormField
                label="Display name"
                value={form.display_name}
                onChangeText={(v) => setForm({ ...form, display_name: v })}
                placeholder="What people call you"
              />
              <FormField
                label="Phone"
                value={form.phone}
                onChangeText={(v) => setForm({ ...form, phone: v })}
                keyboardType="phone-pad"
                placeholder="07700 900123"
              />
              <FormField
                label="Date of birth"
                value={form.dob}
                onChangeText={(v) => setForm({ ...form, dob: v })}
                autoCapitalize="none"
                placeholder="YYYY-MM-DD"
              />
              <FormField
                label="BC membership #"
                value={form.bc_membership_no}
                onChangeText={(v) => setForm({ ...form, bc_membership_no: v })}
                autoCapitalize="none"
                placeholder="Optional"
              />
              <Row style={{ gap: 8, marginTop: 8 }}>
                <Pressable
                  accessibilityRole="button"
                  testID="profile-save"
                  onPress={saveProfile}
                  disabled={savingProfile}
                  style={[styles.primaryBtn, savingProfile && { opacity: 0.6 }]}
                >
                  <Text style={styles.primaryBtnText}>{savingProfile ? 'Saving…' : 'Save'}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setEditing(false);
                    setError(null);
                  }}
                  disabled={savingProfile}
                  style={[styles.ghostBtn, { borderColor: palette.border }]}
                >
                  <Text style={[styles.ghostBtnText, { color: palette.text }]}>Cancel</Text>
                </Pressable>
              </Row>
            </Card>
          ) : (
            <Card>
              <DetailRow palette={palette} label="Full name" value={profile.full_name ?? '—'} />
              <DetailRow
                palette={palette}
                label="Display name"
                value={profile.display_name ?? '—'}
              />
              <DetailRow palette={palette} label="Phone" value={profile.phone ?? '—'} />
              <DetailRow palette={palette} label="Date of birth" value={formatDob(profile.dob)} />
              <DetailRow
                palette={palette}
                label="BC membership"
                value={profile.bc_membership_no ?? '—'}
                last
              />
              <Pressable
                accessibilityRole="button"
                testID="profile-edit"
                onPress={beginEdit}
                style={[styles.editBtn, { borderColor: palette.border }]}
              >
                <Text style={[styles.editBtnText, { color: palette.text }]}>Edit details</Text>
              </Pressable>
            </Card>
          )}

          <View
            onLayout={(e) => {
              experienceY.current = e.nativeEvent.layout.y;
            }}
          >
            <SectionTitle>Paddling experience</SectionTitle>
          </View>
          <Card>
            {expEditing ? (
              <>
                <Text style={[styles.body, { color: palette.text, marginBottom: 12 }]}>
                  {tripReturn
                    ? 'The trip leader will read this to decide whether to take you. The more specific and honest, the better — answer what applies, skip what doesn’t. Saving sends it to the leader and takes you back to the trip.'
                    : 'Help a coach set your starting level. The more specific and honest, the better — answer what applies, skip what doesn’t.'}
                </Text>
                {EXPERIENCE_QUESTIONS.map((q) => (
                  <FormField
                    key={q.key}
                    label={q.label}
                    value={expDraft[q.key] ?? ''}
                    onChangeText={(v) => setExpDraft({ ...expDraft, [q.key]: v })}
                    placeholder={q.placeholder}
                    multiline={q.multiline}
                    testID={`experience-field-${q.key}`}
                  />
                ))}
                <Row style={{ gap: 8, marginTop: 8 }}>
                  <Pressable
                    accessibilityRole="button"
                    testID="experience-save"
                    onPress={saveExperience}
                    disabled={savingExp}
                    style={[styles.primaryBtn, savingExp && { opacity: 0.6 }]}
                  >
                    <Text style={styles.primaryBtnText}>
                      {savingExp ? 'Saving…' : tripReturn ? 'Save and ask the leader' : 'Save'}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setExpEditing(false);
                      setError(null);
                    }}
                    disabled={savingExp}
                    style={[styles.ghostBtn, { borderColor: palette.border }]}
                  >
                    <Text style={[styles.ghostBtnText, { color: palette.text }]}>Cancel</Text>
                  </Pressable>
                </Row>
              </>
            ) : (
              <>
                {hasAnyAnswer(profile.experience_answers) ? (
                  EXPERIENCE_QUESTIONS.filter(
                    (q) => (profile.experience_answers?.[q.key] ?? '').trim().length > 0,
                  ).map((q) => (
                    <View key={q.key} style={{ marginBottom: 12 }}>
                      <Text style={[styles.fieldLabel, { color: palette.muted }]}>{q.label}</Text>
                      <Text
                        style={[
                          styles.fieldValue,
                          { color: palette.text, fontSize: 14, lineHeight: 20 },
                        ]}
                      >
                        {profile.experience_answers?.[q.key]}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.empty, { color: palette.muted }]}>
                    Been paddling a while, or joining from another club? Tell us about it — answer a
                    few questions and a coach can help establish your level.
                  </Text>
                )}
                {profile.experience_review_requested ? (
                  <Text style={[styles.reviewState, { color: OtterPalette.forest }]}>
                    {`✓ Sent for review${
                      profile.experience_submitted_at
                        ? ` · ${formatSubmitted(profile.experience_submitted_at)}`
                        : ''
                    }. A coach will set your level soon.`}
                  </Text>
                ) : profile.experience_reviewed_at ? (
                  <Text style={[styles.reviewState, { color: palette.muted }]}>
                    {`Reviewed · ${formatSubmitted(
                      profile.experience_reviewed_at,
                    )}. Ask a coach if your level looks wrong.`}
                  </Text>
                ) : null}
                <Row style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <Pressable
                    accessibilityRole="button"
                    testID="experience-edit"
                    onPress={beginEditExperience}
                    style={[styles.ghostBtn, { borderColor: palette.border }]}
                  >
                    <Text style={[styles.ghostBtnText, { color: palette.text }]}>
                      {hasAnyAnswer(profile.experience_answers) ? 'Edit answers' : 'Add experience'}
                    </Text>
                  </Pressable>
                  {profile.experience_review_requested ? null : (
                    <Pressable
                      accessibilityRole="button"
                      testID="experience-request-review"
                      onPress={requestReview}
                      disabled={requestingReview || !hasAnyAnswer(profile.experience_answers)}
                      style={[
                        styles.primaryBtn,
                        (requestingReview || !hasAnyAnswer(profile.experience_answers)) && {
                          opacity: 0.6,
                        },
                      ]}
                    >
                      <Text style={styles.primaryBtnText}>
                        {requestingReview ? 'Sending…' : 'Request a level review'}
                      </Text>
                    </Pressable>
                  )}
                </Row>
              </>
            )}
          </Card>

          <SectionTitle>Settings & info</SectionTitle>
          {(
            [
              ['/notifications', 'Notifications', 'profile-notifications'],
              ['/levels', 'Paddling levels', 'profile-levels'],
              ['/about', 'About OtterPool', 'profile-about'],
            ] as const
          ).map(([href, label, testID]) => (
            <Pressable
              key={href}
              accessibilityRole="button"
              onPress={() => router.push(href)}
              testID={testID}
            >
              <Card>
                <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.body, { color: palette.text }]}>{label}</Text>
                  <Text aria-hidden style={[styles.body, { color: palette.muted }]}>
                    ›
                  </Text>
                </Row>
              </Card>
            </Pressable>
          ))}

          <SectionTitle>Session</SectionTitle>
          <Pressable
            accessibilityRole="button"
            onPress={() => supabase.auth.signOut()}
            testID="profile-sign-out"
          >
            <Card>
              <Text style={[styles.signOut, { color: OtterPalette.ice }]}>Sign out</Text>
            </Card>
          </Pressable>

          <Text style={[styles.version, { color: palette.muted }]}>OtterPool v{appVersion}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  autoCapitalize,
  keyboardType,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  testID?: string;
}) {
  const palette = Colors[useColorScheme() ?? 'light'];
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={[styles.fieldLabel, { color: palette.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        testID={testID}
        style={[
          styles.input,
          { color: palette.text, borderColor: palette.border },
          multiline && { minHeight: 72, textAlignVertical: 'top' },
        ]}
      />
    </View>
  );
}

function DetailRow({
  palette,
  label,
  value,
  last,
}: {
  palette: (typeof Colors)['light'];
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.fieldRow,
        !last && { borderBottomWidth: 1, borderBottomColor: palette.border },
      ]}
    >
      <Text style={[styles.fieldLabel, { color: palette.muted }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: palette.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 20, fontWeight: '700' },
  email: { fontSize: 12, marginTop: 2 },
  levelPill: { borderWidth: 1.5, paddingVertical: 3 },
  fieldRow: { paddingVertical: 12 },
  fieldLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' },
  fieldValue: { fontSize: 14, marginTop: 2 },
  body: { fontSize: 13 },
  signOut: { fontSize: 14, fontWeight: '600' },
  version: { fontSize: 12, textAlign: 'center', marginTop: 16 },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: OtterPalette.slateNavy,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  avatarBadgeText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  reviewState: { fontSize: 13, fontWeight: '600', marginTop: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginTop: 4,
  },
  primaryBtn: {
    backgroundColor: OtterPalette.slateNavy,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  ghostBtn: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  ghostBtnText: { fontSize: 14, fontWeight: '600' },
  editBtn: {
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  editBtnText: { fontSize: 14, fontWeight: '600' },
});
