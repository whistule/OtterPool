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

export { Stripe };
