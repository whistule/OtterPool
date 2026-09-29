-- ============================================================
-- OtterPool — drop the Data API write paths nothing uses any more
-- ============================================================
-- Every one of these predates the edge function or RPC that replaced it, and
-- each let a signed-in account step around the rules that replacement enforces.

-- ---------- 1. members may not insert their own sign-ups ----------
-- 20260804000000 pinned the insert to status = 'pending_review', but that still
-- skipped everything the sign-up function checks: lapsed/suspended, min_level,
-- the aspirant trial cap, and draft/closed/cancelled events. The other columns
-- went unchecked too, so a row could arrive with payment_status = 'paid' —
-- which prevent_delete_paid_event then treats as real money, and the leader
-- can no longer delete their own event. The app never inserts sign-ups from
-- the client; the sign-up function writes with the service role.
drop policy if exists "Members can sign up for events" on public.event_signups;

-- ---------- 2. nor may leaders or admins update them directly ----------
-- These let a leader confirm a paid seat without payment, forge
-- payment_status / amount_paid_pence, or move a sign-up to another member.
-- Review goes through review-signup and cancellation through cancel-signup,
-- both as the service role; the client only ever reads event_signups. With
-- these gone the table is read-only over the Data API.
drop policy if exists "Leaders can update signups for their events" on public.event_signups;
drop policy if exists "Admins can update any signup" on public.event_signups;
drop policy if exists "Paddling admins update signups" on public.event_signups;

-- ---------- 3. anon may not list the photo buckets ----------
-- The read policies had no role, so they applied to anon — whose key ships in
-- the web bundle — and the storage list API enumerated every avatars/<user_id>
-- and event-photos/<event_id> folder. Public buckets serve getPublicUrl()
-- without consulting RLS, so images still load for everyone. Signed-in users
-- keep read access because upload(..., { upsert: true }) and copy() need it.
drop policy if exists "Avatars are publicly readable" on storage.objects;
create policy "Avatars are publicly readable"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars');

drop policy if exists "Event photos are publicly readable" on storage.objects;
create policy "Event photos are publicly readable"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'event-photos');

-- ---------- 4. push tokens are claimed only through claim_push_token() ----------
-- The `using (true)` update policy from 20260513000000 was the first attempt at
-- letting a second account take over a device's token. 20260829010000 replaced
-- it with a security definer RPC and the app calls only that, so the loosened
-- policy is no longer load-bearing.
drop policy if exists "Members claim push token on update" on public.user_push_tokens;

-- ---------- 5. pin handle_new_user's search_path ----------
-- The one security definer function still without it (Supabase lint
-- function_search_path_mutable). Its body already schema-qualifies
-- public.profiles; trim/nullif resolve from pg_catalog regardless.
alter function public.handle_new_user() set search_path = '';
