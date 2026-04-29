-- ============================================================
-- OtterPool — Event payments (Stripe)
-- ============================================================

-- new signup state for paid events awaiting Stripe confirmation
alter type public.signup_status add value if not exists 'pending_payment' before 'confirmed';

-- payment fields on signups
alter table public.event_signups
  add column if not exists payment_intent_id text,
  add column if not exists payment_status    text,        -- 'paid', 'failed', null
  add column if not exists amount_paid_pence int;

create index if not exists idx_signups_payment_intent
  on public.event_signups (payment_intent_id);
