import { corsHeaders } from "../_shared/cors.ts";
import { createClients } from "../_shared/supabase.ts";
import { ok, err } from "../_shared/response.ts";
import { meetsLevel } from "../_shared/progression.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth
    const auth = await createClients(req);
    if (auth.error) return auth.error;
    const { admin, user } = auth.clients;

    // Parse request
    const { event_id } = await req.json();
    if (!event_id) return err("event_id is required", 400);

    // Fetch event
    const { data: event } = await admin
      .from("events")
      .select("id, title, min_level, max_participants, approval_mode, status, leader_id")
      .eq("id", event_id)
      .single();

    if (!event) return err("Event not found", 404);
    if (event.status !== "open") return err(`Event is ${event.status} — sign-ups are closed`, 409);

    // Fetch member profile
    const { data: profile } = await admin
      .from("profiles")
      .select("id, full_name, level, status")
      .eq("id", user.id)
      .single();

    if (!profile) return err("Profile not found — complete your profile first", 404);
    if (profile.status === "lapsed") return err("Your membership has lapsed — please renew to sign up", 403);
    if (profile.status === "suspended") return err("Your account is suspended", 403);

    // Check already signed up
    const { data: existing } = await admin
      .from("event_signups")
      .select("id, status")
      .eq("event_id", event_id)
      .eq("member_id", user.id)
      .maybeSingle();

    if (existing) return err(`Already signed up — status: ${existing.status}`, 409);

    // Check progression level
    if (!meetsLevel(profile.level, event.min_level)) {
      return err(`Requires ${event.min_level} level — you are currently ${profile.level}`, 403);
    }

    // Check capacity
    const { count: confirmedCount } = await admin
      .from("event_signups")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event_id)
      .eq("status", "confirmed");

    const isFull = event.max_participants && (confirmedCount ?? 0) >= event.max_participants;

    // Determine signup status
    let signupStatus: string;
    let message: string;

    if (isFull) {
      signupStatus = "waitlisted";
      message = "Event is full — you've been added to the waitlist";
    } else if (event.approval_mode === "manual_all") {
      signupStatus = "pending_review";
      message = "Sign-up submitted — the leader will review your request";
    } else {
      // Auto mode — confirm immediately (Phase 2 will add ceiling checks here)
      signupStatus = "confirmed";
      message = "You're in! Sign-up confirmed";
    }

    // Create the signup
    const { data: signup, error: signupError } = await admin
      .from("event_signups")
      .insert({ event_id, member_id: user.id, status: signupStatus })
      .select()
      .single();

    if (signupError) return err(`Failed to create sign-up: ${signupError.message}`, 500);

    // If event just hit capacity, update status to full
    if (signupStatus === "confirmed" && event.max_participants) {
      if ((confirmedCount ?? 0) + 1 >= event.max_participants) {
        await admin.from("events").update({ status: "full" }).eq("id", event_id);
      }
    }

    return ok({ signup, message });
  } catch (e) {
    return err(`Internal error: ${String(e)}`, 500);
  }
});
