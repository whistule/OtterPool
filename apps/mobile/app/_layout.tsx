import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, isRecoveryPending, setRecoveryPending, useAuth } from '@/lib/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { routeForNotification } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

export const unstable_settings = {
  anchor: '(tabs)',
};

function AuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    if (loading) {
      return;
    }
    const inAuthGroup = segments[0] === '(auth)';
    const onResetPassword = segments[0] === 'reset-password';
    if (session && !onResetPassword && isRecoveryPending()) {
      // Recovery link followed but no new password set — that session can't do
      // anything useful, so end it and let the redirect below take over.
      setRecoveryPending(false);
      supabase.auth.signOut();
      return;
    }
    if (!session && !inAuthGroup && !onResetPassword) {
      router.replace('/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/');
    }
  }, [session, loading, segments, router]);

  useNotificationTapNavigation(session != null && !loading);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.background,
        }}
      >
        <ActivityIndicator size="large" color={palette.tint} />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

function useNotificationTapNavigation(enabled: boolean) {
  const router = useRouter();
  const handledColdStartRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;

    // Cold start: the app was launched by tapping a notification. Drain once.
    if (!handledColdStartRef.current) {
      handledColdStartRef.current = true;
      Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (cancelled || !response) {
            return;
          }
          const route = routeForNotification(
            response.notification.request.content.data as Record<string, unknown>,
          );
          if (route) {
            router.replace(route as never);
          }
        })
        .catch(() => {});
    }

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = routeForNotification(
        response.notification.request.content.data as Record<string, unknown>,
      );
      if (route) {
        router.push(route as never);
      }
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [enabled, router]);
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AuthGate />
          <StatusBar style="auto" />
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
