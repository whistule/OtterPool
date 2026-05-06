import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { Avatar } from '@/components/photo';
import { Card, Pill, Row, SectionTitle, TopBar } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth';
import { pickImage, removePhoto, uploadPhoto } from '@/lib/photos';
import { LEVEL_EMOJI, LEVEL_LABEL } from '@/lib/progress';
import { supabase } from '@/lib/supabase';

type EmergencyContact = {
  id: string;
  name: string;
  relationship: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  is_primary: boolean;
};

type ProfileFields = {
  full_name: string;
  display_name: string;
  phone: string;
  dob: string;
  bc_membership_no: string;
  medical_notes: string;
};

const STATUS_COLOR: Record<string, string> = {
  active: OtterPalette.forest,
  aspirant: OtterPalette.lochPool,
  lapsed: OtterPalette.burntOrange,
  suspended: OtterPalette.ice,
};

function formatDob(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isValidDob(s: string): boolean {
  if (!s) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}

export default function ProfileScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const { session, profile, refreshProfile } = useAuth();

  const [contacts, setContacts] = useState<EmergencyContact[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProfileFields | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // contactMode: 'closed' = no form; 'new' = adding; { id } = editing existing.
  const [contactMode, setContactMode] = useState<'closed' | 'new' | { id: string }>(
    'closed',
  );
  const [contactDraft, setContactDraft] = useState<{
    name: string;
    relationship: string;
    phone: string;
    email: string;
    address: string;
    is_primary: boolean;
  }>({ name: '', relationship: '', phone: '', email: '', address: '', is_primary: false });
  const [savingContact, setSavingContact] = useState(false);

  const emptyContactDraft = {
    name: '',
    relationship: '',
    phone: '',
    email: '',
    address: '',
    is_primary: false,
  };

  const beginAddContact = () => {
    setContactDraft(emptyContactDraft);
    setContactMode('new');
    setError(null);
  };

  const beginEditContact = (c: EmergencyContact) => {
    setContactDraft({
      name: c.name,
      relationship: c.relationship ?? '',
      phone: c.phone,
      email: c.email ?? '',
      address: c.address ?? '',
      is_primary: c.is_primary,
    });
    setContactMode({ id: c.id });
    setError(null);
  };

  const closeContactForm = () => {
    setContactMode('closed');
    setError(null);
  };

  const loadContacts = useCallback(async () => {
    if (!session) {
      setContacts([]);
      return;
    }
    const { data, error: err } = await supabase
      .from('emergency_contacts')
      .select('id, name, relationship, phone, email, address, is_primary')
      .eq('member_id', session.user.id)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });
    if (err) {
      setError(err.message);
      setContacts([]);
    } else {
      setContacts((data ?? []) as EmergencyContact[]);
    }
  }, [session]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshProfile(), loadContacts()]);
    setRefreshing(false);
  };

  const onChangeAvatar = async () => {
    if (!session) return;
    const asset = await pickImage();
    if (!asset) return;
    setError(null);
    setUploadingAvatar(true);
    const previousPath = profile?.avatar_path ?? null;
    const result = await uploadPhoto('avatars', session.user.id, asset);
    if ('error' in result) {
      setError(`Avatar upload failed: ${result.error}`);
      setUploadingAvatar(false);
      return;
    }
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ avatar_path: result.path })
      .eq('id', session.user.id);
    if (updateErr) {
      setError(updateErr.message);
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
    if (!profile) return;
    setForm({
      full_name: profile.full_name ?? '',
      display_name: profile.display_name ?? '',
      phone: profile.phone ?? '',
      dob: profile.dob ?? '',
      bc_membership_no: profile.bc_membership_no ?? '',
      medical_notes: profile.medical_notes ?? '',
    });
    setEditing(true);
  };

  const saveProfile = async () => {
    if (!form || !session) return;
    if (!isValidDob(form.dob)) {
      setError('Date of birth must be YYYY-MM-DD');
      return;
    }
    setError(null);
    setSavingProfile(true);
    const { error: err } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name.trim() || null,
        display_name: form.display_name.trim() || null,
        phone: form.phone.trim() || null,
        dob: form.dob.trim() || null,
        bc_membership_no: form.bc_membership_no.trim() || null,
        medical_notes: form.medical_notes.trim() || null,
      })
      .eq('id', session.user.id);
    setSavingProfile(false);
    if (err) {
      setError(err.message);
      return;
    }
    await refreshProfile();
    setEditing(false);
  };

  const saveContact = async () => {
    if (!session) return;
    if (!contactDraft.name.trim() || !contactDraft.phone.trim()) {
      setError('Name and phone are required for an emergency contact.');
      return;
    }
    setError(null);
    setSavingContact(true);
    const editingId = typeof contactMode === 'object' ? contactMode.id : null;
    if (contactDraft.is_primary) {
      // Demote any existing primary so the unique partial index doesn't fire.
      let demote = supabase
        .from('emergency_contacts')
        .update({ is_primary: false })
        .eq('member_id', session.user.id)
        .eq('is_primary', true);
      if (editingId) demote = demote.neq('id', editingId);
      await demote;
    }
    const payload = {
      name: contactDraft.name.trim(),
      relationship: contactDraft.relationship.trim() || null,
      phone: contactDraft.phone.trim(),
      email: contactDraft.email.trim() || null,
      address: contactDraft.address.trim() || null,
      is_primary: contactDraft.is_primary,
    };
    const res = editingId
      ? await supabase
          .from('emergency_contacts')
          .update(payload)
          .eq('id', editingId)
      : await supabase
          .from('emergency_contacts')
          .insert({ ...payload, member_id: session.user.id });
    setSavingContact(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setContactDraft(emptyContactDraft);
    setContactMode('closed');
    await loadContacts();
  };

  const deleteContact = (c: EmergencyContact) => {
    const doDelete = async () => {
      const { error: err } = await supabase
        .from('emergency_contacts')
        .delete()
        .eq('id', c.id);
      if (err) setError(err.message);
      else await loadContacts();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Remove ${c.name}?`)) doDelete();
    } else {
      Alert.alert('Remove contact', `Remove ${c.name}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const makePrimary = async (c: EmergencyContact) => {
    if (!session || c.is_primary) return;
    await supabase
      .from('emergency_contacts')
      .update({ is_primary: false })
      .eq('member_id', session.user.id)
      .eq('is_primary', true);
    const { error: err } = await supabase
      .from('emergency_contacts')
      .update({ is_primary: true })
      .eq('id', c.id);
    if (err) setError(err.message);
    else await loadContacts();
  };

  if (!profile || contacts == null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }} edges={['top']}>
        <TopBar title="Profile" subtitle="Your details and settings" />
        <View style={styles.center}>
          <ActivityIndicator color={palette.tint} />
        </View>
      </SafeAreaView>
    );
  }

  const email = session?.user?.email ?? '—';
  const headlineName = profile.display_name || profile.full_name || email;
  const levelEmoji = LEVEL_EMOJI[profile.level];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          <TopBar title="Profile" subtitle="Your details and settings" />

          <Card>
            <Row style={{ gap: 14 }}>
              <Pressable
                onPress={uploadingAvatar ? undefined : onChangeAvatar}
                testID="profile-change-avatar"
                style={{ position: 'relative' }}>
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
                  <Pill
                    label={`${levelEmoji} ${LEVEL_LABEL[profile.level]}`}
                    color={OtterPalette.slateNavy}
                  />
                  <Pill
                    label={profile.status}
                    color={STATUS_COLOR[profile.status] ?? OtterPalette.lochPool}
                  />
                  {profile.is_admin ? <Pill label="Admin" color={OtterPalette.burntOrange} /> : null}
                </Row>
              </View>
            </Row>
          </Card>

          {error ? (
            <Card>
              <Text style={[styles.errTitle, { color: OtterPalette.ice }]}>{error}</Text>
            </Card>
          ) : null}

          {profile.is_admin ? (
            <Pressable
              onPress={() => router.push('/members')}
              testID="admin-manage-members">
              <Card style={styles.adminCard}>
                <Text style={styles.adminKicker}>Admin</Text>
                <Text style={styles.adminAction}>Manage members ›</Text>
              </Card>
            </Pressable>
          ) : null}

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
              <FormField
                label="Medical conditions / allergies"
                value={form.medical_notes}
                onChangeText={(v) => setForm({ ...form, medical_notes: v })}
                placeholder="Visible to your trip leader during the event window"
                multiline
              />
              <Row style={{ gap: 8, marginTop: 8 }}>
                <Pressable
                  testID="profile-save"
                  onPress={saveProfile}
                  disabled={savingProfile}
                  style={[styles.primaryBtn, savingProfile && { opacity: 0.6 }]}>
                  <Text style={styles.primaryBtnText}>
                    {savingProfile ? 'Saving…' : 'Save'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setEditing(false);
                    setError(null);
                  }}
                  disabled={savingProfile}
                  style={[styles.ghostBtn, { borderColor: palette.border }]}>
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
              />
              <DetailRow
                palette={palette}
                label="Medical / allergies"
                value={profile.medical_notes ?? 'None recorded'}
                last
              />
              <Pressable
                testID="profile-edit"
                onPress={beginEdit}
                style={[styles.editBtn, { borderColor: palette.border }]}>
                <Text style={[styles.editBtnText, { color: palette.text }]}>Edit details</Text>
              </Pressable>
            </Card>
          )}

          <SectionTitle>Emergency contacts</SectionTitle>
          {contacts.length === 0 && contactMode !== 'new' ? (
            <Card>
              <Text style={[styles.empty, { color: palette.muted }]}>
                No emergency contacts yet. Add at least one before your first event.
              </Text>
            </Card>
          ) : null}
          {contacts.map((c) => {
            const editingThis =
              typeof contactMode === 'object' && contactMode.id === c.id;
            if (editingThis) {
              return (
                <ContactForm
                  key={c.id}
                  testIdSuffix={c.id}
                  draft={contactDraft}
                  setDraft={setContactDraft}
                  onSave={saveContact}
                  onCancel={closeContactForm}
                  saving={savingContact}
                  saveLabel="Save contact"
                />
              );
            }
            return (
              <Card key={c.id}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Row style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Text style={[styles.iceName, { color: palette.text }]}>{c.name}</Text>
                      {c.is_primary ? <Pill label="Primary" color={OtterPalette.ice} /> : null}
                    </Row>
                    <Text style={[styles.iceMeta, { color: palette.muted }]}>
                      {c.relationship ? `${c.relationship} · ` : ''}
                      {c.phone}
                    </Text>
                    {c.email ? (
                      <Text style={[styles.iceMeta, { color: palette.muted }]}>{c.email}</Text>
                    ) : null}
                    {c.address ? (
                      <Text style={[styles.iceMeta, { color: palette.muted }]}>{c.address}</Text>
                    ) : null}
                  </View>
                </Row>
                <Row style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <Pressable
                    testID={`contact-edit-${c.id}`}
                    onPress={() => beginEditContact(c)}
                    style={[styles.ghostBtn, { borderColor: palette.border }]}>
                    <Text style={[styles.ghostBtnText, { color: palette.text }]}>Edit</Text>
                  </Pressable>
                  {!c.is_primary ? (
                    <Pressable
                      testID={`contact-make-primary-${c.id}`}
                      onPress={() => makePrimary(c)}
                      style={[styles.ghostBtn, { borderColor: palette.border }]}>
                      <Text style={[styles.ghostBtnText, { color: palette.text }]}>
                        Make primary
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    testID={`contact-remove-${c.id}`}
                    onPress={() => deleteContact(c)}
                    style={[styles.ghostBtn, { borderColor: palette.border }]}>
                    <Text style={[styles.ghostBtnText, { color: OtterPalette.ice }]}>Remove</Text>
                  </Pressable>
                </Row>
              </Card>
            );
          })}

          {contactMode === 'new' ? (
            <ContactForm
              testIdSuffix="new"
              draft={contactDraft}
              setDraft={setContactDraft}
              onSave={saveContact}
              onCancel={closeContactForm}
              saving={savingContact}
              saveLabel="Add contact"
            />
          ) : contactMode === 'closed' ? (
            <Pressable testID="contact-add" onPress={beginAddContact}>
              <Card style={{ alignItems: 'center' }}>
                <Text style={[styles.addLink, { color: OtterPalette.slateNavy }]}>
                  + Add contact
                </Text>
              </Card>
            </Pressable>
          ) : null}

          <SectionTitle>Visibility</SectionTitle>
          <Card>
            <Text style={[styles.body, { color: palette.text }]}>
              Medical and emergency contact info is shared with your trip leader from event start
              until midnight the following day.
            </Text>
          </Card>

          <SectionTitle>Session</SectionTitle>
          <Pressable onPress={() => supabase.auth.signOut()} testID="profile-sign-out">
            <Card>
              <Text style={[styles.signOut, { color: OtterPalette.ice }]}>Sign out</Text>
            </Card>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ContactForm({
  testIdSuffix,
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
  saveLabel,
}: {
  testIdSuffix: string;
  draft: {
    name: string;
    relationship: string;
    phone: string;
    email: string;
    address: string;
    is_primary: boolean;
  };
  setDraft: (d: {
    name: string;
    relationship: string;
    phone: string;
    email: string;
    address: string;
    is_primary: boolean;
  }) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  saveLabel: string;
}) {
  const palette = Colors[useColorScheme() ?? 'light'];
  return (
    <Card>
      <FormField
        label="Name"
        value={draft.name}
        onChangeText={(v) => setDraft({ ...draft, name: v })}
        placeholder="Full name"
        testID={`contact-field-name-${testIdSuffix}`}
      />
      <FormField
        label="Relationship"
        value={draft.relationship}
        onChangeText={(v) => setDraft({ ...draft, relationship: v })}
        placeholder="e.g. Partner"
      />
      <FormField
        label="Phone"
        value={draft.phone}
        onChangeText={(v) => setDraft({ ...draft, phone: v })}
        keyboardType="phone-pad"
        placeholder="07700 900456"
        testID={`contact-field-phone-${testIdSuffix}`}
      />
      <FormField
        label="Email"
        value={draft.email}
        onChangeText={(v) => setDraft({ ...draft, email: v })}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Optional"
      />
      <FormField
        label="Address"
        value={draft.address}
        onChangeText={(v) => setDraft({ ...draft, address: v })}
        placeholder="Optional"
        multiline
      />
      <Pressable
        testID={`contact-primary-toggle-${testIdSuffix}`}
        onPress={() => setDraft({ ...draft, is_primary: !draft.is_primary })}
        style={[styles.checkbox, { borderColor: palette.border }]}>
        <Text style={{ color: palette.text, fontSize: 14 }}>
          {draft.is_primary ? '☑' : '☐'} Primary contact
        </Text>
      </Pressable>
      <Row style={{ gap: 8, marginTop: 8 }}>
        <Pressable
          testID={`contact-save-${testIdSuffix}`}
          onPress={onSave}
          disabled={saving}
          style={[styles.primaryBtn, saving && { opacity: 0.6 }]}>
          <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : saveLabel}</Text>
        </Pressable>
        <Pressable
          testID={`contact-cancel-${testIdSuffix}`}
          onPress={onCancel}
          disabled={saving}
          style={[styles.ghostBtn, { borderColor: palette.border }]}>
          <Text style={[styles.ghostBtnText, { color: palette.text }]}>Cancel</Text>
        </Pressable>
      </Row>
    </Card>
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
      ]}>
      <Text style={[styles.fieldLabel, { color: palette.muted }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: palette.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { padding: 32, alignItems: 'center' },
  name: { fontSize: 20, fontWeight: '700' },
  email: { fontSize: 12, marginTop: 2 },
  fieldRow: { paddingVertical: 12 },
  fieldLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' },
  fieldValue: { fontSize: 14, marginTop: 2 },
  iceName: { fontSize: 15, fontWeight: '700' },
  iceMeta: { fontSize: 12, marginTop: 2 },
  addLink: { fontSize: 14, fontWeight: '700' },
  body: { fontSize: 13 },
  signOut: { fontSize: 14, fontWeight: '600' },
  errTitle: { fontSize: 14, fontWeight: '700' },
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
  adminCard: { backgroundColor: OtterPalette.slateNavy, borderColor: OtterPalette.slateNavy },
  adminKicker: {
    color: '#ffffff',
    opacity: 0.7,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  adminAction: { color: '#ffffff', fontSize: 16, fontWeight: '700', marginTop: 4 },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },
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
  checkbox: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
});
