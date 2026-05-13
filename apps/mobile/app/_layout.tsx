import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/lib/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { routeForNotification } from '@/lib/notifications';

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
    if (!session && !inAuthGroup) {
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

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
    </Stack>
  );
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
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthGate />
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}
