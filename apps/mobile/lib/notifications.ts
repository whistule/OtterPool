import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// Foreground behaviour — show the heads-up banner even when the app is open,
// otherwise the user sees nothing and assumes push is broken.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#3b82f6',
  });
}

export async function registerForPushNotifications(userId: string): Promise<void> {
  // Expo Go on SDK 53+ can't receive remote push. Bail rather than upserting a
  // token that will never be reachable — local notifications still work.
  if (Constants.appOwnership === 'expo') {
    console.warn('[push] skipping registration: running in Expo Go');
    return;
  }
  if (!Device.isDevice) {
    console.warn('[push] skipping registration: not a physical device');
    return;
  }

  await ensureAndroidChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== 'granted') {
    const { status: requested } = await Notifications.requestPermissionsAsync();
    status = requested;
  }
  if (status !== 'granted') {
    console.warn('[push] permission not granted:', status);
    return;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  const token = tokenResponse.data;
  if (!token) {
    return;
  }

  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

  const { error } = await supabase
    .from('user_push_tokens')
    .upsert(
      { expo_push_token: token, user_id: userId, platform },
      { onConflict: 'expo_push_token' },
    );
  if (error) {
    console.warn('[push] upsert failed:', error.message);
  }
}

// Routes a tapped notification to the right screen.
// Most types open the event; `event_cancelled` goes home because the event
// row has been deleted by the time the push arrives.
export function routeForNotification(data: Record<string, unknown> | undefined): string | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const type = typeof data.type === 'string' ? data.type : null;
  const eventId = typeof data.event_id === 'string' ? data.event_id : null;

  if (type === 'event_cancelled') {
    return '/';
  }
  if (eventId) {
    return `/event/${eventId}`;
  }
  return null;
}

export type DiagStep = { step: string; ok: boolean; detail: string };

export async function diagnosePushRegistration(userId: string): Promise<DiagStep[]> {
  const steps: DiagStep[] = [];
  const push = (s: DiagStep) => {
    steps.push(s);
  };

  push({
    step: 'appOwnership',
    ok: Constants.appOwnership !== 'expo',
    detail: `Constants.appOwnership=${String(Constants.appOwnership)} (must NOT be 'expo')`,
  });
  push({
    step: 'isDevice',
    ok: Device.isDevice,
    detail: `Device.isDevice=${Device.isDevice}`,
  });
  push({
    step: 'platform',
    ok: true,
    detail: `Platform.OS=${Platform.OS}`,
  });

  try {
    const { status } = await Notifications.getPermissionsAsync();
    push({ step: 'permissions', ok: status === 'granted', detail: `status=${status}` });
    if (status !== 'granted') {
      const { status: requested } = await Notifications.requestPermissionsAsync();
      push({
        step: 'permissions.request',
        ok: requested === 'granted',
        detail: `requested=${requested}`,
      });
    }
  } catch (e) {
    push({ step: 'permissions', ok: false, detail: `threw: ${String(e)}` });
    return steps;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  push({
    step: 'projectId',
    ok: !!projectId,
    detail: projectId ? String(projectId) : 'MISSING — getExpoPushTokenAsync will throw',
  });

  let token: string | null = null;
  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    token = tokenResponse.data ?? null;
    push({
      step: 'getExpoPushTokenAsync',
      ok: !!token,
      detail: token ? `${token.slice(0, 30)}…` : 'no token returned',
    });
  } catch (e) {
    push({ step: 'getExpoPushTokenAsync', ok: false, detail: `threw: ${String(e)}` });
    return steps;
  }

  if (!token) {
    return steps;
  }

  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  const { error } = await supabase
    .from('user_push_tokens')
    .upsert(
      { expo_push_token: token, user_id: userId, platform },
      { onConflict: 'expo_push_token' },
    );
  push({
    step: 'upsert user_push_tokens',
    ok: !error,
    detail: error ? error.message : 'inserted/updated',
  });

  return steps;
}

const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

function reminderId(eventId: string): string {
  return `event-reminder-${eventId}`;
}

export async function scheduleEventReminder(
  eventId: string,
  eventTitle: string,
  startsAt: string,
): Promise<void> {
  const start = new Date(startsAt).getTime();
  if (Number.isNaN(start)) {
    return;
  }
  const fireAt = start - REMINDER_LEAD_MS;
  // If the trip starts in under 24h, don't schedule — a 5-minute reminder for
  // something starting in 6h is more annoying than useful, and we don't want
  // to surprise people with same-day notifications they didn't ask for.
  if (fireAt <= Date.now()) {
    return;
  }

  const id = reminderId(eventId);
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: 'Trip tomorrow',
      body: eventTitle,
      data: { type: 'event_reminder', event_id: eventId },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(fireAt) },
  });
}

export async function cancelEventReminder(eventId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(reminderId(eventId)).catch(() => {});
}
