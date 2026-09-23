-- ============================================================
-- OtterPool — Membership verification (core backend)
-- ============================================================
-- Mirrors "who is a paid-up DCKC member this year" from a MemberMojo email
-- export into OtterPool so the sign-up gate can key off membership. See
-- docs/membership-verification.md.
--
-- The email list is ordinary personal data. It is stored plaintext but the
-- table is RLS-locked with NO policies, so only the service role (and these
-- SECURITY DEFINER functions) can ever read it — never a logged-in member via
-- the Data API. All matching happens server-side; the client never receives
-- the list.
--
-- Each row carries the member's own expiry date, so membership auto-lapses on
-- that date at the next reconcile — a stale list no longer keeps someone a
-- member indefinitely. (A null expiry means "valid while on the list", for
-- rows pasted without a parseable date.)

-- ---------- the mirrored list ----------
create table if not exists public.verified_members (
  email_norm    text primary key,   -- lower(trim(email)); the match key
  expires_on    date,               -- membership expiry; null = no expiry
  imported_at   timestamptz not null default now()
);

-- RLS ON, NO policies → service role only (it bypasses RLS; everyone else on
-- the public API gets zero rows).
alter table public.verified_members enable row level security;

-- ---------- track who manages each member's status ----------
-- 'list'  = managed by the import/reconcile flow
-- 'manual'= an admin set it by hand; reconcile must not undo it
alter table public.profiles
  add column if not exists membership_source text
    not null default 'list'
    check (membership_source in ('list', 'manual'));

-- Rollout safety: every profile that predates this system is marked 'manual'
-- so the FIRST reconcile can't auto-lapse anyone before they've been matched
-- against a real export. Matched members are re-stamped to 'list' by the
-- reconcile (see below) once they turn up on an imported list.
-- (explicit all-rows WHERE: Supabase's safeupdate guard rejects a bare UPDATE,
-- the same way it rejected the bare DELETE fixed in 20260922020000)
update public.profiles set membership_source = 'manual' where true;

-- ============================================================
-- Reconcile — bring every profile's status in line with the current list.
-- ============================================================
-- "A valid membership" = the email is on the list AND the row hasn't expired
-- (expires_on null or today or later). Three moves, all gated on the caller
-- having membership-admin rights:
--   1. Upgrade   — aspirant/lapsed with a valid membership → active + list.
--   2. Re-stamp  — actives with a valid membership but marked 'manual' → 'list'
--                  so future reconciles manage them. A manual active WITHOUT a
--                  valid membership (an email-mismatch override) is left alone
--                  and stays protected.
--   3. Downgrade — list-managed actives without a valid membership (off the
--                  list, or on it but expired) → lapsed.
-- 'suspended' is a sticky admin state and is excluded from every path by
-- construction (moves only ever touch aspirant/lapsed/active rows).
create or replace function public.reconcile_membership()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activated int;
  v_restamped int;
  v_lapsed int;
begin
  if not (select public.is_membership_admin()) then
    raise exception 'not authorised';
  end if;

  with up as (
    update public.profiles p
    set status = 'active', membership_source = 'list'
    from auth.users u
    where u.id = p.id
      and p.status in ('aspirant', 'lapsed')
      and exists (
        select 1 from public.verified_members v
        where v.email_norm = lower(trim(u.email))
          and (v.expires_on is null or v.expires_on >= current_date)
      )
    returning 1
  )
  select count(*) into v_activated from up;

  with rs as (
    update public.profiles p
    set membership_source = 'list'
    from auth.users u
    where u.id = p.id
      and p.status = 'active'
      and p.membership_source = 'manual'
      and exists (
        select 1 from public.verified_members v
        where v.email_norm = lower(trim(u.email))
          and (v.expires_on is null or v.expires_on >= current_date)
      )
    returning 1
  )
  select count(*) into v_restamped from rs;

  with dn as (
    update public.profiles p
    set status = 'lapsed'
    from auth.users u
    where u.id = p.id
      and p.status = 'active'
      and p.membership_source = 'list'
      and not exists (
        select 1 from public.verified_members v
        where v.email_norm = lower(trim(u.email))
          and (v.expires_on is null or v.expires_on >= current_date)
      )
    returning 1
  )
  select count(*) into v_lapsed from dn;

  return jsonb_build_object(
    'activated', v_activated,
    'restamped', v_restamped,
    'lapsed', v_lapsed
  );
end;
$$;

-- ============================================================
-- Import — replace the mirror with a pasted list, then reconcile.
-- ============================================================
-- Takes the paste as a jsonb array of {email, expires} objects (the client
-- splits the two pasted columns, normalises dates to ISO 'YYYY-MM-DD', and
-- hands over a clean array; blanks/dupes are handled again here defensively).
-- The whole thing runs in the function's single transaction, so the list is
-- never seen half-replaced. Duplicate emails collapse to the furthest expiry.
create or replace function public.import_verified_members(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_expiring int;
begin
  if not (select public.is_membership_admin()) then
    raise exception 'not authorised';
  end if;

  delete from public.verified_members;

  insert into public.verified_members (email_norm, expires_on)
  select distinct on (email_norm) email_norm, expires_on
  from (
    select
      lower(trim(r ->> 'email')) as email_norm,
      nullif(trim(coalesce(r ->> 'expires', '')), '')::date as expires_on
    from jsonb_array_elements(p_rows) as r
    where trim(coalesce(r ->> 'email', '')) <> ''
      and position('@' in (r ->> 'email')) > 1
  ) x
  order by email_norm, expires_on desc nulls last;

  select count(*) into v_count from public.verified_members;
  select count(*) into v_expiring
  from public.verified_members
  where expires_on is not null and expires_on < current_date;

  return jsonb_build_object('imported', v_count, 'already_expired', v_expiring)
    || public.reconcile_membership();
end;
$$;

-- ============================================================
-- Claim — match the CURRENT user against the list (match-on-sign-in).
-- ============================================================
-- Called by the app for a logged-in aspirant. Because the caller has a session
-- their email is already confirmed, so a match proves address ownership — the
-- security property the design relies on. Only ever upgrades the caller's own
-- aspirant row to active (and only for an unexpired membership); never
-- downgrades, never touches anyone else.
create or replace function public.claim_membership()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_matched boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select lower(trim(u.email)) into v_email from auth.users u where u.id = v_uid;
  v_matched := exists (
    select 1 from public.verified_members v
    where v.email_norm = v_email
      and (v.expires_on is null or v.expires_on >= current_date)
  );

  if v_matched then
    update public.profiles
    set status = 'active', membership_source = 'list'
    where id = v_uid and status = 'aspirant';
  end if;

  return jsonb_build_object('matched', v_matched);
end;
$$;

-- SECURITY DEFINER functions in public are callable by PUBLIC by default. Each
-- body gates on its own rules, but lock execution to signed-in users as
-- defence in depth.
revoke all on function public.reconcile_membership() from public, anon;
revoke all on function public.import_verified_members(jsonb) from public, anon;
revoke all on function public.claim_membership() from public, anon;
grant execute on function public.reconcile_membership() to authenticated;
grant execute on function public.import_verified_members(jsonb) to authenticated;
grant execute on function public.claim_membership() to authenticated;
