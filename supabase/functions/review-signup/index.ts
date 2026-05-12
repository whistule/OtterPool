import { corsHeaders } from '../_shared/cors.ts';
import { createClients } from '../_shared/supabase.ts';
import { ok, err } from '../_shared/response.ts';
import { sendPush } from '../_shared/push.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await createClients(req);
    if (auth.error) {
      return auth.error;
    }
    const { admin, user } = auth.clients;

    const { signup_id, action } = await req.json();
    if (!signup_id) {
      return err('signup_id is required', 400);
    }
    if (action !== 'confirm' && action !== 'deny') {
      return err("action must be 'confirm' or 'deny'", 400);
    }

    // Fetch signup + parent event in one go
    const { data: signup } = await admin
      .from('event_signups')
      .select(
        'id, status, event_id, member_id, event:events!event_signups_event_id_fkey(id, title, leader_id, cost, max_participants, status)',
      )
      .eq('id', signup_id)
      .maybeSingle();

    if (!signup) {
      return err('Sign-up not found', 404);
    }

    const event = signup.event as {
      id: string;
      title: string;
      leader_id: string;
      cost: number;
      max_participants: number | null;
      status: string;
    } | null;
    if (!event) {
      return err('Event not found for sign-up', 404);
    }

    if (event.leader_id !== user.id) {
      return err('Only the event leader can review sign-ups', 403);
    }

    if (signup.status !== 'pending_review') {
      return err(`Sign-up is not pending review (status: ${signup.status})`, 409);
    }

    if (action === 'deny') {
      const { error: updateErr } = await admin
        .from('event_signups')
        .update({
          status: 'declined',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', signup_id);
      if (updateErr) {
        return err(`Update failed: ${updateErr.message}`, 500);
      }
      await sendPush(admin, [signup.member_id], {
        title: 'Sign-up declined',
        body: `Your sign-up to ${event.title} was declined`,
        data: { type: 'signup_reviewed', event_id: event.id, signup_id, status: 'declined' },
      });
      return ok({ signup_id, status: 'declined' });
    }

    // Confirm path — re-check capacity at decision time.
    if (event.max_participants) {
      const { count: confirmedCount } = await admin
        .from('event_signups')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .eq('status', 'confirmed');
      if ((confirmedCount ?? 0) >= event.max_participants) {
        const { error: updateErr } = await admin
          .from('event_signups')
          .update({
            status: 'waitlisted',
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', signup_id);
        if (updateErr) {
          return err(`Update failed: ${updateErr.message}`, 500);
        }
        await sendPush(admin, [signup.member_id], {
          title: 'Moved to waitlist',
          body: `${event.title} filled up before your sign-up was approved`,
          data: { type: 'signup_reviewed', event_id: event.id, signup_id, status: 'waitlisted' },
        });
        return ok({
          signup_id,
          status: 'waitlisted',
          message: 'Event is now full — moved to waitlist',
        });
      }
    }

    const isPaid = Number(event.cost ?? 0) > 0;
    const nextStatus = isPaid ? 'pending_payment' : 'confirmed';

    const update: Record<string, unknown> = {
      status: nextStatus,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    };
    if (isPaid) {
      update.payment_status = 'pending';
    }

    const { error: updateErr } = await admin
      .from('event_signups')
      .update(update)
      .eq('id', signup_id);
    if (updateErr) {
      return err(`Update failed: ${updateErr.message}`, 500);
    }

    // If a free confirmation just filled the event, mark it full.
    if (nextStatus === 'confirmed' && event.max_participants && event.status === 'open') {
      const { count } = await admin
        .from('event_signups')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .eq('status', 'confirmed');
      if ((count ?? 0) >= event.max_participants) {
        await admin.from('events').update({ status: 'full' }).eq('id', event.id);
      }
    }

    const memberBody =
      nextStatus === 'confirmed'
        ? `You're in for ${event.title}`
        : `Approved — pay to confirm your place on ${event.title}`;
    await sendPush(admin, [signup.member_id], {
      title: nextStatus === 'confirmed' ? 'Sign-up confirmed' : 'Sign-up approved',
      body: memberBody,
      data: { type: 'signup_reviewed', event_id: event.id, signup_id, status: nextStatus },
    });

    return ok({ signup_id, status: nextStatus });
  } catch (e) {
    return err(`Internal error: ${String(e)}`, 500);
  }
});
