export type PriceOption = { label?: string; pence?: number };

export type Priced = {
  cost: number | string | null;
  price_options: PriceOption[] | null;
};

function tiers(event: Priced): PriceOption[] {
  return Array.isArray(event.price_options) ? event.price_options : [];
}

/**
 * Resolve the amount to charge (in pence) and the tier label, entirely from
 * the stored event — never from a client-supplied amount. When the event has
 * concession tiers, `priceOption` selects one by index; a missing or
 * out-of-range index falls back to index 0 (the standard rate). With no tiers,
 * the flat `cost` column (pounds) applies.
 */
export function resolveCharge(
  event: Priced,
  priceOption: unknown,
): { pence: number; label: string | null } {
  const options = tiers(event);
  if (options.length > 0) {
    const idx =
      Number.isInteger(priceOption) &&
      (priceOption as number) >= 0 &&
      (priceOption as number) < options.length
        ? (priceOption as number)
        : 0;
    const chosen = options[idx] ?? options[0];
    return {
      pence: Math.max(0, Math.round(Number(chosen?.pence ?? 0))),
      label: chosen?.label ?? null,
    };
  }
  return { pence: Math.round(Number(event.cost ?? 0) * 100), label: null };
}

/**
 * True if attending can cost money — any tier, not just the standard one.
 * Used where no tier has been chosen yet (leader approval, waitlist promotion):
 * such a seat must go through sign-up, where the member picks a tier and
 * resolveCharge decides whether checkout is needed. Reading `cost` alone
 * (tier 0) confirmed a £5 tier for free whenever the standard tier was £0.
 */
export function mayCharge(event: Priced): boolean {
  const options = tiers(event);
  if (options.length > 0) {
    return options.some((o) => Number(o?.pence ?? 0) > 0);
  }
  return Number(event.cost ?? 0) > 0;
}
