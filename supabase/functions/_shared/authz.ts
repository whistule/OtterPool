import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type RoleFlags = {
  superAdmin: boolean;
  membershipAdmin: boolean;
  paddlingAdmin: boolean;
};

/**
 * Read a user's admin roles. Super admin implies the others, matching
 * `roleFlags` in apps/mobile/lib/auth.tsx and the is_membership_admin() /
 * is_paddling_admin() predicates the RLS policies use.
 *
 * Safe to call with the service-role admin client.
 */
export async function roleFlags(admin: SupabaseClient, userId: string): Promise<RoleFlags> {
  const { data } = await admin
    .from('profiles')
    .select('is_admin, is_membership_admin, is_paddling_admin')
    .eq('id', userId)
    .maybeSingle();
  const superAdmin = !!data?.is_admin;
  return {
    superAdmin,
    membershipAdmin: superAdmin || !!data?.is_membership_admin,
    paddlingAdmin: superAdmin || !!data?.is_paddling_admin,
  };
}

/** True if the user may manage events and their sign-ups (paddling or super admin). */
export async function isPaddlingAdmin(admin: SupabaseClient, userId: string): Promise<boolean> {
  return (await roleFlags(admin, userId)).paddlingAdmin;
}
