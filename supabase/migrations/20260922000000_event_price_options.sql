-- Optional concession pricing for events.
--
-- Some events (e.g. the Pinkston white-water sessions) charge different rates
-- for different people — Adult £10, Under-18 £5, basin-only £5. Rather than a
-- separate table, the choices ride along on the event as a small JSON array so
-- a single-price event stays exactly as it was (this column null → the flat
-- `cost` column applies).
--
-- Shape: [{ "label": "Adult", "pence": 1000 }, { "label": "Under 18", "pence": 500 }].
--   * amounts are whole pence (integers), never pounds, so the value handed to
--     Stripe needs no rounding and can't disagree with what is displayed;
--   * index 0 is the standard rate and should match `cost` — the sign-up
--     function falls back to it when no choice (or an out-of-range choice)
--     comes from the client.
--
-- Trust model: the app sends only *which* option was picked (an index), never
-- an amount. The sign-up edge function reads the amount from THIS column
-- server-side, so a tampered client can at worst pick a legitimate cheaper
-- option — it can never invent a price. Eligibility (is the member really a
-- concession?) is on trust, by design; the app does not police it.
alter table public.events
  add column if not exists price_options jsonb;

comment on column public.events.price_options is
  'Optional concession pricing. JSON array of {label:text, pence:int}. When present, sign-up charges the member-selected option (validated server-side against this list); when null, the flat `cost` column applies. Index 0 is the standard rate and should match `cost`.';
