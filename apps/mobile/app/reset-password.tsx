import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
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

type RecoveryParams =
  | { kind: 'pkce'; code: string }
  | { kind: 'implicit'; accessToken: string; refreshToken: string };

function parseRecoveryFromUrl(url: string): RecoveryParams | null {
  // PKCE flow: ?code=... in the query string.
  const queryIdx = url.indexOf('?');
  if (queryIdx !== -1) {
    const end = url.indexOf('#', queryIdx);
    const queryStr = url.slice(queryIdx + 1, end === -1 ? undefined : end);
    const q = new URLSearchParams(queryStr);
    const code = q.get('code');
    if (code) {
      return { kind: 'pkce', code };
    }
  }
  // Implicit flow: #access_token=...&refresh_token=...&type=recovery
  const hashIdx = url.indexOf('#');
  if (hashIdx !== -1) {
    const params = new URLSearchParams(url.slice(hashIdx + 1));
    if (params.get('type') === 'recovery') {
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        return { kind: 'implicit', accessToken, refreshToken };
      }
    }
  }
  return null;
}

export default function ResetPasswordScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const reactiveUrl = Linking.useURL();
  const params = useLocalSearchParams<{ code?: string }>();
  const [ready, setReady] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [seenUrl, setSeenUrl] = useState<string | null>(null);
  const [initialUrl, setInitialUrl] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const consumedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const consume = async (url: string | null) => {
      if (cancelled || consumedRef.current || !url) {
        return;
      }
      setSeenUrl(url);
      const recovery = parseRecoveryFromUrl(url);
      if (!recovery) {
        // On web, supabase-js's detectSessionInUrl already consumed the URL.
        if (Platform.OS === 'web') {
          const { data } = await supabase.auth.getSession();
          if (!cancelled && data.session) {
            consumedRef.current = true;
            setReady(true);
            return;
          }
        }
        return;
      }
      consumedRef.current = true;
      const result =
        recovery.kind === 'pkce'
          ? await supabase.auth.exchangeCodeForSession(recovery.code)
          : await supabase.auth.setSession({
              access_token: recovery.accessToken,
              refresh_token: recovery.refreshToken,
            });
      if (cancelled) {
        return;
      }
      if (result.error) {
        setTokenError(result.error.message);
        return;
      }
      setReady(true);
    };

    // expo-router exposes ?code=... from the deep link via search params,
    // which is reliable even when the OS strips URL fragments.
    if (params.code) {
      consume(`otterpool:///reset-password?code=${params.code}`);
    }

    Linking.getInitialURL().then((u) => {
      setInitialUrl(u);
      consume(u);
    });
    const sub = Linking.addEventListener('url', (event) => {
      consume(event.url);
    });

    if (Platform.OS === 'web') {
      // Web flow: detectSessionInUrl already ran. If we're here with a session, we're ready.
      supabase.auth.getSession().then(({ data }) => {
        if (!cancelled && !consumedRef.current && data.session) {
          consumedRef.current = true;
          setReady(true);
        }
      });
    }

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [params.code]);

  const handleSubmit = async () => {
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
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setBusy(false);
      setError(updateError.message);
      return;
    }
    await supabase.auth.signOut();
    setBusy(false);
    setDone(true);
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
          <Text style={[styles.tag, { color: palette.muted }]}>Choose a new password</Text>
        </View>

        <View
          style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          {done ? (
            <>
              <Text style={[styles.info, { color: palette.text }]}>
                Password updated. Sign in with your new password.
              </Text>
              <Pressable
                onPress={() => router.replace('/sign-in')}
                style={[styles.primaryBtn, { backgroundColor: OtterPalette.slateNavy }]}
              >
                <Text style={styles.primaryBtnText}>Sign in</Text>
              </Pressable>
            </>
          ) : tokenError ? (
            <>
              <Text style={[styles.error, { color: OtterPalette.ice }]}>{tokenError}</Text>
              <Pressable
                onPress={() => router.replace('/forgot-password')}
                style={[styles.primaryBtn, { backgroundColor: OtterPalette.slateNavy }]}
              >
                <Text style={styles.primaryBtnText}>Request a new link</Text>
              </Pressable>
            </>
          ) : !ready ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator color={palette.tint} />
              <Text style={[styles.info, { color: palette.muted, marginTop: 12 }]}>
                Checking link [v4]…
              </Text>
              <Text style={[styles.info, { color: palette.muted, fontSize: 11 }]} selectable>
                code param: {params.code ?? '(none)'}
              </Text>
              <Text style={[styles.info, { color: palette.muted, fontSize: 11 }]} selectable>
                initial: {initialUrl ?? '(none)'}
              </Text>
              <Text style={[styles.info, { color: palette.muted, fontSize: 11 }]} selectable>
                reactive: {reactiveUrl ?? '(none)'}
              </Text>
              <Text style={[styles.info, { color: palette.muted, fontSize: 11 }]} selectable>
                consumed: {seenUrl ?? '(none)'}
              </Text>
            </View>
          ) : (
            <>
              <Text style={[styles.label, { color: palette.muted }]}>New password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="newPassword"
                autoComplete="password-new"
                placeholder="At least 8 characters"
                placeholderTextColor={palette.muted}
                style={[styles.input, { color: palette.text, borderColor: palette.border }]}
              />

              <Text style={[styles.label, { color: palette.muted, marginTop: 14 }]}>
                Confirm password
              </Text>
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                textContentType="newPassword"
                autoComplete="password-new"
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
                placeholder="••••••••"
                placeholderTextColor={palette.muted}
                style={[styles.input, { color: palette.text, borderColor: palette.border }]}
              />

              {error ? (
                <Text style={[styles.error, { color: OtterPalette.ice }]}>{error}</Text>
              ) : null}

              <Pressable
                onPress={handleSubmit}
                disabled={busy}
                style={[
                  styles.primaryBtn,
                  { backgroundColor: OtterPalette.slateNavy, opacity: busy ? 0.6 : 1 },
                ]}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Update password</Text>
                )}
              </Pressable>
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
  error: { fontSize: 13, marginTop: 12, marginBottom: 8, fontWeight: '500' },
  primaryBtn: { marginTop: 20, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
