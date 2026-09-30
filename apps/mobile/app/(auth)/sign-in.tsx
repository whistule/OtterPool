import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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

export default function SignInScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const handleSignIn = async () => {
    // Trim to match sign-up and forgot-password, which both store/look up the
    // trimmed address — without this a stray space makes a real account look
    // like bad credentials here and nowhere else.
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Email and password are required');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
    }
  };

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: palette.background }]}
      edges={['top', 'bottom']}
    >
      <PageTitle title="Sign in" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.brand}>
          <Text
            accessibilityRole="header"
            style={[styles.wordmark, { color: OtterPalette.slateNavy }]}
          >
            OtterPool
          </Text>
          <Text style={[styles.tag, { color: palette.muted }]}>DCKC</Text>
        </View>

        <View
          style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          <Text style={[styles.label, { color: palette.muted }]}>Email</Text>
          <TextInput
            accessibilityLabel="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            autoComplete="email"
            importantForAutofill="yes"
            returnKeyType={password ? 'go' : 'next'}
            onSubmitEditing={() => {
              if (password) {
                handleSignIn();
              } else {
                passwordRef.current?.focus();
              }
            }}
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
            textContentType="password"
            autoComplete="current-password"
            importantForAutofill="yes"
            returnKeyType="go"
            onSubmitEditing={handleSignIn}
            placeholder="••••••••"
            placeholderTextColor={palette.muted}
            style={[styles.input, { color: palette.text, borderColor: palette.border }]}
          />

          {error ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: OtterPalette.ice }]}>
              {error}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={handleSignIn}
            disabled={busy}
            style={[
              styles.primaryBtn,
              { backgroundColor: OtterPalette.slateNavy, opacity: busy ? 0.6 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Sign in</Text>
            )}
          </Pressable>

          <Text style={[styles.createHintHead, { color: palette.text }]}>New here?</Text>
          <Text style={[styles.createHint, { color: palette.muted }]}>
            If you're a DCKC member, create your account with the{' '}
            <Text style={{ fontWeight: '700', color: palette.text }}>
              same email as your MemberMojo login
            </Text>{' '}
            and OtterPool will recognise you as a member.
          </Text>

          <Link href="/sign-up" asChild>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              // Link asChild throws on a style array, so hand it one object.
              // tint rather than slateNavy: navy on the dark card is unreadable.
              style={StyleSheet.flatten([styles.secondaryBtn, { borderColor: palette.tint }])}
            >
              <Text style={[styles.secondaryBtnText, { color: palette.tint }]}>Create account</Text>
            </Pressable>
          </Link>

          <Link href="/forgot-password" asChild>
            <Pressable accessibilityRole="button" disabled={busy} style={styles.tertiaryBtn}>
              <Text style={[styles.tertiaryBtnText, { color: palette.muted }]}>
                Forgot password?
              </Text>
            </Pressable>
          </Link>
        </View>

        <Text style={[styles.footer, { color: palette.muted }]}>
          DCKC members only · Aspirants get 3 trial sessions
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  brand: {
    alignItems: 'center',
    marginTop: 48,
    marginBottom: 28,
  },
  wordmark: { fontSize: 38, fontWeight: '700', letterSpacing: -0.5, fontStyle: 'italic' },
  tag: { fontSize: 13, marginTop: 4, letterSpacing: 1.5 },
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
  primaryBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  createHintHead: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 20,
  },
  createHint: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 4,
  },
  secondaryBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700' },
  tertiaryBtn: { marginTop: 4, paddingVertical: 8, alignItems: 'center' },
  tertiaryBtnText: { fontSize: 13, fontWeight: '500' },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    marginTop: 24,
    paddingHorizontal: 32,
  },
});
