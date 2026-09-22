// Event cost is stored as a decimal number of pounds, and the sign-up edge
// function charges Math.round(cost * 100) pence. The UI used to render it with
// `toFixed(0)`, which rounds — a 50p trip displayed as "£1" while Stripe
// correctly took 50p. Always show pence so the label can't disagree with the
// amount actually charged.
const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

/** "£0.50", "£5.00". Amount only — callers supply their own surrounding copy. */
export function formatMoney(cost: number | string | null | undefined): string {
  const n = Number(cost ?? 0);
  if (!Number.isFinite(n)) {
    return GBP.format(0);
  }
  return GBP.format(n);
}

/** As formatMoney, but a zero cost reads "Free" rather than "£0.00". */
export function formatCost(cost: number | string | null | undefined): string {
  const n = Number(cost ?? 0);
  if (!Number.isFinite(n) || n === 0) {
    return 'Free';
  }
  return GBP.format(n);
}

/**
 * A concession-pricing choice stored on an event (see the
 * `20260922000000_event_price_options` migration). Amounts are whole pence, so
 * the value handed to Stripe needs no rounding.
 */
export type PriceOption = { label: string; pence: number };

/** As formatMoney, but takes a whole number of pence (as price options store). */
export function formatPence(pence: number | string | null | undefined): string {
  const n = Number(pence ?? 0);
  if (!Number.isFinite(n)) {
    return GBP.format(0);
  }
  return GBP.format(n / 100);
}

/**
 * Coerce a stored `price_options` value into a clean list. Anything that isn't
 * a well-formed {label, pence} array (including the null single-price case)
 * comes back empty, so callers can treat "no options" and "bad data" alike.
 */
export function parsePriceOptions(raw: unknown): PriceOption[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: PriceOption[] = [];
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const label = String((item as { label?: unknown }).label ?? '').trim();
      const pence = Math.round(Number((item as { pence?: unknown }).pence));
      if (label && Number.isFinite(pence) && pence >= 0) {
        out.push({ label, pence });
      }
    }
  }
  return out;
}
