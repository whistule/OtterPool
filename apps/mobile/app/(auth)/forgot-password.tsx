import * as Linking from 'expo-linking';
import { Link, router } from 'expo-router';
import React, { useState } from 'react';
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

import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';

export default function ForgotPasswordScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email');
      return;
    }
    setBusy(true);
    setError(null);

    const redirectTo =
      Platform.OS === 'web'
        ? `${window.location.origin}/reset-password`
        : Linking.createURL('/reset-password');

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo,
    });
    setBusy(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  };

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: palette.background }]}
      edges={['top', 'bottom']}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.brand}>
          <Text style={[styles.wordmark, { color: OtterPalette.slateNavy }]}>OtterPool</Text>
          <Text style={[styles.tag, { color: palette.muted }]}>Reset your password</Text>
        </View>

        <View
          style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          {sent ? (
            <>
              <Text style={[styles.info, { color: palette.text }]}>
                Check your inbox. We've sent a link to reset your password.
              </Text>
              <Pressable
                onPress={() => router.replace('/sign-in')}
                style={[styles.primaryBtn, { backgroundColor: OtterPalette.slateNavy }]}
              >
                <Text style={styles.primaryBtnText}>Back to sign in</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.label, { color: palette.muted }]}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                autoComplete="email"
                returnKeyType="go"
                onSubmitEditing={handleSend}
                placeholder="you@example.com"
                placeholderTextColor={palette.muted}
                style={[styles.input, { color: palette.text, borderColor: palette.border }]}
              />

              {error ? (
                <Text style={[styles.error, { color: OtterPalette.ice }]}>{error}</Text>
              ) : null}

              <Pressable
                onPress={handleSend}
                disabled={busy}
                style={[
                  styles.primaryBtn,
                  { backgroundColor: OtterPalette.slateNavy, opacity: busy ? 0.6 : 1 },
                ]}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Send reset link</Text>
                )}
              </Pressable>

              <Link href="/sign-in" asChild>
                <Pressable disabled={busy} style={styles.secondaryBtn}>
                  <Text style={[styles.secondaryBtnText, { color: OtterPalette.slateNavy }]}>
                    Back to sign in
                  </Text>
                </Pressable>
              </Link>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  brand: { alignItems: 'center', marginTop: 48, marginBottom: 28 },
  wordmark: { fontSize: 38, fontWeight: '700', letterSpacing: -0.5, fontStyle: 'italic' },
  tag: { fontSize: 13, marginTop: 4, letterSpacing: 1.5 },
  card: { marginHorizontal: 20, padding: 20, borderRadius: 16, borderWidth: 1 },
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
  info: { fontSize: 14, marginBottom: 16, lineHeight: 20 },
  error: { fontSize: 13, marginTop: 12, fontWeight: '500' },
  primaryBtn: { marginTop: 20, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: { marginTop: 10, paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },
});
