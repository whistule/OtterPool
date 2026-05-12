-- ============================================================
-- OtterPool — Expo push tokens
-- ============================================================
-- One row per (user, device). Tokens come from
-- Notifications.getExpoPushTokenAsync() and are sent to
-- https://exp.host/--/api/v2/push/send by the edge functions.
-- A single user may have multiple devices, so the PK is the
-- token itself rather than the user. Tokens are globally unique
-- per Expo's design.

create table if not exists public.user_push_tokens (
  expo_push_token text primary key,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  platform        text not null check (platform in ('ios', 'android', 'web')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_user_push_tokens_user
  on public.user_push_tokens (user_id);

create trigger user_push_tokens_updated_at
  before update on public.user_push_tokens
  for each row execute function public.set_updated_at();

alter table public.user_push_tokens enable row level security;

-- Members can read/write only their own tokens. The edge functions
-- use the service-role key and bypass RLS to read across users.
create policy "Members manage own push tokens"
  on public.user_push_tokens for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
