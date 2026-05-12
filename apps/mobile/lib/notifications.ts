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

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  const token = tokenResponse.data;
  if (!token) {
    return;
  }

  const platform =
    Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

  const { error } = await supabase
    .from('user_push_tokens')
    .upsert({ expo_push_token: token, user_id: userId, platform }, { onConflict: 'expo_push_token' });
  if (error) {
    console.warn('[push] upsert failed:', error.message);
  }
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
