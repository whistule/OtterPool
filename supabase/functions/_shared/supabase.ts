import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { err } from './response.ts';

export type Clients = {
  /** Scoped to the calling user — respects RLS */
  supabase: SupabaseClient;
  /** Service-role client — bypasses RLS */
  admin: SupabaseClient;
  /** The authenticated user */
  user: { id: string; email?: string; email_confirmed_at?: string };
};

/**
 * Creates both a user-scoped and admin Supabase client from
 * the request's Authorization header.  Returns null + a 401
 * Response if auth fails.
 */
export async function createClients(
  req: Request,
): Promise<{ clients: Clients; error?: never } | { clients?: never; error: Response }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { error: err('Missing authorization header', 401) };
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    // Via err() so the CORS headers come too — without them a browser reports
    // an expired session as a network failure instead of a 401.
    return { error: err('Invalid token', 401) };
  }

  return { clients: { supabase, admin, user } };
}
