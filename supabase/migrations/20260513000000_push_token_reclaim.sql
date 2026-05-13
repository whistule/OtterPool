-- ============================================================
-- Allow a different user signing in on the same physical device
-- to claim its push token row. The original combined policy used
-- `user_id = auth.uid()` on the USING side, which made the
-- conflict→UPDATE leg of an upsert fail when the token already
-- belonged to a previous user of the device.
--
-- Split the policy: SELECT/DELETE stay scoped to own rows; UPDATE
-- is permissive on USING but still pins the new owner via the
-- WITH CHECK clause, so any UPDATE has to set user_id to auth.uid().
-- ============================================================

drop policy if exists "Members manage own push tokens" on public.user_push_tokens;

create policy "Members read own push tokens"
  on public.user_push_tokens for select
  to authenticated
  using (user_id = auth.uid());

create policy "Members delete own push tokens"
  on public.user_push_tokens for delete
  to authenticated
  using (user_id = auth.uid());

create policy "Members insert own push tokens"
  on public.user_push_tokens for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Members claim push token on update"
  on public.user_push_tokens for update
  to authenticated
  using (true)
  with check (user_id = auth.uid());
