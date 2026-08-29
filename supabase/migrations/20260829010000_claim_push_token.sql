-- ============================================================
-- OtterPool — make claiming a device's push token actually work
-- ============================================================
-- 20260513000000_push_token_reclaim.sql set the UPDATE policy to
-- `using (true)` so a second account on the same physical device could
-- take over its token row. That was necessary but not sufficient, and
-- the case was never re-tested afterwards: signing in as a second user
-- still failed with
--
--   new row violates row-level security policy (USING expression)
--     for table "user_push_tokens"
--
-- Reproduced against a scratch Postgres with exactly these four
-- policies. The blocker is the SELECT policy, not the UPDATE one:
-- `insert ... on conflict do update` has to read the conflicting row,
-- so RLS applies the SELECT policy to it. That policy is
-- `user_id = auth.uid()`, the row belongs to the *previous* user, so
-- the read is refused before the permissive UPDATE policy is reached.
--
-- Broadening SELECT to `true` fixes it and was rejected: it would let
-- any authenticated member read every device token in the club.
--
-- Instead, do the upsert in a security definer function. RLS is not
-- consulted, no policy has to be loosened, and user_id comes from
-- auth.uid() inside the function rather than from the client, so a
-- caller cannot assign a token to anybody but themselves.

create or replace function public.claim_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'must be signed in to register a push token';
  end if;

  insert into public.user_push_tokens (expo_push_token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (expo_push_token) do update
    set user_id  = excluded.user_id,
        platform = excluded.platform;
end;
$$;

revoke all on function public.claim_push_token(text, text) from public;
grant execute on function public.claim_push_token(text, text) to authenticated;
