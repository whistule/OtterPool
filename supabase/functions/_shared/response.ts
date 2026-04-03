import { corsHeaders } from "./cors.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

/** Return a JSON success response. */
export function ok(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

/** Return a JSON error response. */
export function err(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: jsonHeaders });
}
