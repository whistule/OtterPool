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
