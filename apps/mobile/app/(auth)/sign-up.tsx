import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
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

import { PageTitle } from '@/components/page-title';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { webRouteUrl } from '@/lib/urls';

export default function SignUpScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const displayNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const handleSignUp = async () => {
    const trimmedFull = fullName.trim();
    const trimmedDisplay = displayName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedFull || !trimmedDisplay || !trimmedEmail || !password) {
      setError('All fields are required');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);

    const emailRedirectTo = Platform.OS === 'web' ? webRouteUrl('/') : Linking.createURL('/');

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: { full_name: trimmedFull, display_name: trimmedDisplay },
        emailRedirectTo,
      },
    });

    setBusy(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      // Email confirmation disabled — AuthGate will route into the app.
      return;
    }

    setInfo('Check your email to confirm — then sign in.');
  };

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: palette.background }]}
      edges={['top', 'bottom']}
    >
      <PageTitle title="Sign up" />
      <KeyboardAvoidingView
        // Cap the column so the card isn't stretched across a desktop browser.
        style={{ flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Text style={[styles.wordmark, { color: OtterPalette.slateNavy }]}>OtterPool</Text>
            <Text accessibilityRole="header" style={[styles.tag, { color: palette.muted }]}>
              Create your account
            </Text>
          </View>

          <View
            style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
          >
            <Text style={[styles.createHintHead, { color: palette.text }]}>New to OtterPool?</Text>
            <Text style={[styles.createHint, { color: palette.muted }]}>
              If you're a DCKC member, create your account with the{' '}
              <Text style={{ fontWeight: '700', color: palette.text }}>
                same email as your MemberMojo login
              </Text>{' '}
              and OtterPool will recognise you as a member.
            </Text>

            <Text style={[styles.label, { color: palette.muted }]}>Full name</Text>
            <TextInput
              accessibilityLabel="Full name"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="name"
              autoComplete="name"
              importantForAutofill="yes"
              returnKeyType="next"
              onSubmitEditing={() => displayNameRef.current?.focus()}
              submitBehavior="submit"
              placeholder="Jane Paddler"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />

            <Text style={[styles.label, { color: palette.muted, marginTop: 14 }]}>
              Display name
            </Text>
            <TextInput
              accessibilityLabel="Display name"
              ref={displayNameRef}
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="nickname"
              autoComplete="username"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              submitBehavior="submit"
              placeholder="How you'll appear on sign-up lists"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />

            <Text style={[styles.label, { color: palette.muted, marginTop: 14 }]}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              ref={emailRef}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              importantForAutofill="yes"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              submitBehavior="submit"
              placeholder="you@example.com"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />

            <Text style={[styles.label, { color: palette.muted, marginTop: 14 }]}>Password</Text>
            <TextInput
              accessibilityLabel="Password"
              ref={passwordRef}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="newPassword"
              autoComplete="new-password"
              passwordRules="minlength: 8;"
              importantForAutofill="yes"
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
              submitBehavior="submit"
              placeholder="At least 8 characters"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />

            <Text style={[styles.label, { color: palette.muted, marginTop: 14 }]}>
              Confirm password
            </Text>
            <TextInput
              accessibilityLabel="Confirm password"
              ref={confirmRef}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              textContentType="newPassword"
              autoComplete="new-password"
              returnKeyType="go"
              onSubmitEditing={handleSignUp}
              placeholder="••••••••"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />

            {error ? (
              <Text accessibilityRole="alert" style={[styles.error, { color: OtterPalette.ice }]}>
                {error}
              </Text>
            ) : null}
            {info ? (
              <Text accessibilityRole="alert" style={[styles.info, { color: palette.muted }]}>
                {info}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={handleSignUp}
              disabled={busy}
              style={[
                styles.primaryBtn,
                { backgroundColor: OtterPalette.slateNavy, opacity: busy ? 0.6 : 1 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Create account</Text>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              disabled={busy}
              style={styles.secondaryBtn}
            >
              <Text style={[styles.secondaryBtnText, { color: OtterPalette.slateNavy }]}>
                Back to sign in
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.footer, { color: palette.muted }]}>
            New paddlers start as aspirants with 3 trial sessions. A club admin will confirm your
            membership.
          </Text>
          <Pressable accessibilityRole="link" onPress={() => router.push('/about')}>
            <Text style={[styles.footer, { color: OtterPalette.slateNavy }]}>
              How we use your information
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: 32 },
  brand: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 20,
  },
  wordmark: { fontSize: 32, fontWeight: '700', letterSpacing: -0.5, fontStyle: 'italic' },
  tag: { fontSize: 13, marginTop: 4, letterSpacing: 0.4 },
  card: {
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  error: { fontSize: 13, marginTop: 12, fontWeight: '500' },
  info: { fontSize: 13, marginTop: 12 },
  primaryBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  createHintHead: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  createHint: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    marginTop: 16,
    paddingHorizontal: 32,
  },
});
