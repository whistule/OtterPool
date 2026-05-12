// Expo push notifications. Sends to https://exp.host/--/api/v2/push/send,
// which accepts up to 100 messages per call. Failures are logged, never
// thrown — push is a notification, not a transaction; never block the caller.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

export async function sendPush(
  admin: SupabaseClient,
  userIds: string[],
  message: PushMessage,
): Promise<void> {
  if (userIds.length === 0) {
    return;
  }

  const uniqueIds = Array.from(new Set(userIds));
  const { data: tokens, error } = await admin
    .from('user_push_tokens')
    .select('expo_push_token')
    .in('user_id', uniqueIds);

  if (error) {
    console.error('[push] token fetch failed', error.message);
    return;
  }
  if (!tokens || tokens.length === 0) {
    return;
  }

  const messages = tokens.map((t) => ({
    to: t.expo_push_token,
    sound: 'default',
    title: message.title,
    body: message.body,
    data: message.data ?? {},
  }));

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        console.error('[push] expo responded', res.status, await res.text());
      }
    } catch (e) {
      console.error('[push] send failed', String(e));
    }
  }
}
