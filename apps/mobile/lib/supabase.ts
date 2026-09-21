import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// Deliberately no fallback. These used to default to the dev project, which
// meant a build with the vars missing came up silently pointed at dev — a
// production app writing to the dev database, with nothing to notice it.
// Failing loudly here is the whole point; see .env.example.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must both be set. ' +
      'Copy apps/mobile/.env.example to .env.local for local development.',
  );
}

// Re-exported so callers that need to build a URL against the project (e.g.
// the payment-return edge function) use the same validated value instead of
// re-reading the env with a fallback of their own.
export const supabaseUrl = SUPABASE_URL;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});
