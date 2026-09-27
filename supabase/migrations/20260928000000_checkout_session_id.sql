-- ============================================================
-- OtterPool — which Checkout session holds a seat
-- ============================================================
-- Checkout sessions now expire after two hours, and the checkout.session.expired
-- webhook releases the held seat (and an aspirant's trial). Since Stripe API
-- 2022-08-01 Checkout creates its PaymentIntent lazily, so an abandoned session
-- nobody tried to pay has no PaymentIntent and payment_intent.canceled never
-- fires — before this, those pending_payment rows held their seat indefinitely.
--
-- Every retry opens a new session. Only the latest one may release the seat,
-- otherwise an abandoned first attempt expiring withdraws a seat the member is
-- paying for through a second one. sign-up records it; the webhook matches it.
alter table public.event_signups
  add column if not exists checkout_session_id text;
