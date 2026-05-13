// Stripe → app deep-link bouncer for native clients.
//
// Stripe Checkout only accepts http(s) URLs for success_url / cancel_url, so
// a native client can't pass `otterpool://event/X` directly. Instead the
// client passes this function's URL with `event_id` (and optional result
// flags) in the query string, and we 302 back into the app's custom scheme.
// Web clients don't need this — they just pass their own origin URL.
//
// verify_jwt = false so Stripe's anonymous redirect works.

Deno.serve((req) => {
  const url = new URL(req.url);
  const eventId = url.searchParams.get('event_id');
  if (!eventId || !/^[0-9a-f-]{36}$/i.test(eventId)) {
    return new Response('invalid event_id', { status: 400 });
  }

  // Forward whichever flag Stripe appended (`paid=1` or `cancelled=1`) so the
  // event screen can render the right feedback.
  const params = new URLSearchParams();
  if (url.searchParams.get('paid')) {
    params.set('paid', '1');
  }
  if (url.searchParams.get('cancelled')) {
    params.set('cancelled', '1');
  }

  const query = params.toString();
  const target = `otterpool://event/${eventId}${query ? `?${query}` : ''}`;
  return new Response(null, { status: 302, headers: { Location: target } });
});
