import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno&no-check';

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) {
    return cached;
  }
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  cached = new Stripe(key, {
    apiVersion: '2024-04-10',
    httpClient: Stripe.createFetchHttpClient(),
  });
  return cached;
}

/**
 * Expires a Checkout Session so it can no longer be paid. Returns false only
 * if it has already been paid — the webhook will confirm that seat. Stripe
 * refuses to expire anything that isn't open, so an already-expired session
 * counts as closed.
 */
export async function expireCheckout(sessionId: string): Promise<boolean> {
  const stripe = getStripe();
  try {
    await stripe.checkout.sessions.expire(sessionId);
    return true;
  } catch (e) {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status === 'expired') {
      return true;
    }
    if (session.status === 'complete') {
      return false;
    }
    throw e;
  }
}

export { Stripe };
