import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Clients = {
  /** Scoped to the calling user — respects RLS */
  supabase: SupabaseClient;
  /** Service-role client — bypasses RLS */
  admin: SupabaseClient;
  /** The authenticated user */
  user: { id: string; email?: string };
};

/**
 * Creates both a user-scoped and admin Supabase client from
 * the request's Authorization header.  Returns null + a 401
 * Response if auth fails.
 */
export async function createClients(
  req: Request,
): Promise<{ clients: Clients; error?: never } | { clients?: never; error: Response }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return {
      error: new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    };
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return {
      error: new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    };
  }

  return { clients: { supabase, admin, user } };
}
