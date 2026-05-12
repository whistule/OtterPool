import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** True if the given user has `profiles.is_admin = true`. Safe to call with service-role admin. */
export async function isAdmin(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
  return !!data?.is_admin;
}
