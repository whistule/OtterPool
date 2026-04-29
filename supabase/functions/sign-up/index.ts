import { corsHeaders } from "../_shared/cors.ts";
import { createClients } from "../_shared/supabase.ts";
import { ok, err } from "../_shared/response.ts";
import { meetsLevel } from "../_shared/progression.ts";
import { getStripe } from "../_shared/stripe.ts";

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
    const { event_id, return_url } = await req.json();
    if (!event_id) return err("event_id is required", 400);

    // Fetch event
    const { data: event } = await admin
      .from("events")
      .select("id, title, min_level, max_participants, approval_mode, status, leader_id, cost")
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

    // Cost in pence — Stripe operates in minor units
    const costPence = Math.round(Number(event.cost ?? 0) * 100);
    const isPaid = costPence > 0;

    // Check existing signup. Allow resuming a stalled paid signup with a fresh Checkout session.
    const { data: existing } = await admin
      .from("event_signups")
      .select("id, status")
      .eq("event_id", event_id)
      .eq("member_id", user.id)
      .maybeSingle();

    if (existing && existing.status !== "pending_payment") {
      return err(`Already signed up — status: ${existing.status}`, 409);
    }

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

    // Determine target signup status (after payment, if paid)
    let targetStatus: string;
    let message: string;

    if (isFull) {
      targetStatus = "waitlisted";
      message = "Event is full — you've been added to the waitlist";
    } else if (event.approval_mode === "manual_all") {
      targetStatus = "pending_review";
      message = "Sign-up submitted — the leader will review your request";
    } else {
      targetStatus = "confirmed";
      message = "You're in! Sign-up confirmed";
    }

    // Paid + not waitlisted → create Stripe Checkout session and hold seat as pending_payment
    if (isPaid && targetStatus !== "waitlisted") {
      if (!return_url) return err("return_url is required for paid events", 400);

      // Reuse the existing pending row, or create one
      let signupId: string;
      if (existing) {
        signupId = existing.id;
      } else {
        const { data: signup, error: signupError } = await admin
          .from("event_signups")
          .insert({
            event_id,
            member_id: user.id,
            status: "pending_payment",
            payment_status: "pending",
          })
          .select()
          .single();
        if (signupError) return err(`Failed to create sign-up: ${signupError.message}`, 500);
        signupId = signup.id;
      }

      const stripe = getStripe();
      const sep = return_url.includes("?") ? "&" : "?";
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "gbp",
              product_data: { name: event.title },
              unit_amount: costPence,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          description: `OtterPool — ${event.title}`,
          metadata: {
            signup_id: signupId,
            event_id: event.id,
            member_id: user.id,
            target_status: targetStatus,
          },
        },
        metadata: {
          signup_id: signupId,
          event_id: event.id,
          member_id: user.id,
        },
        customer_email: user.email,
        success_url: `${return_url}${sep}paid=1`,
        cancel_url: `${return_url}${sep}cancelled=1`,
      });

      return ok({
        signup: { id: signupId, status: "pending_payment" },
        message: "Continue to payment to complete sign-up",
        payment: { checkout_url: session.url, amount_pence: costPence },
      });
    }

    // Free event (or paid + waitlist) — apply target status directly
    const { data: signup, error: signupError } = await admin
      .from("event_signups")
      .insert({ event_id, member_id: user.id, status: targetStatus })
      .select()
      .single();

    if (signupError) return err(`Failed to create sign-up: ${signupError.message}`, 500);

    // If event just hit capacity, update status to full
    if (targetStatus === "confirmed" && event.max_participants) {
      if ((confirmedCount ?? 0) + 1 >= event.max_participants) {
        await admin.from("events").update({ status: "full" }).eq("id", event_id);
      }
    }

    return ok({ signup, message });
  } catch (e) {
    return err(`Internal error: ${String(e)}`, 500);
  }
});
