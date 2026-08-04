// The privilege escalations closed by 20260804000000_tighten_profile_and_signup_rls.
//
// Every other spec drives the UI, which never offers these controls — so the
// UI passing proves nothing about the policies underneath. These talk to
// PostgREST directly as an ordinary member, the way an attacker with the
// publishable key and a browser console would.

import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

// Same fallbacks as lib/supabase.ts — the publishable key is client-side by
// design; these tests exist precisely because it can't be trusted.
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://fguutbhbzradrdyrxixg.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_XXYU9OBfhMhMQevUmFQGsQ_GhTVmNNB';

const MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL ?? 'e2e-member@test.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-test-password';
const FIXTURE_TITLE = 'E2E Manual Review Trip';

async function memberClient() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: MEMBER_EMAIL,
    password: PASSWORD,
  });
  expect(error, 'member sign-in should succeed').toBeNull();
  return { supabase, userId: data.user!.id };
}

test.describe('RLS — a member cannot escalate their own privileges', () => {
  // Without this, every assertion below would also pass if auth were simply
  // broken and the member could write nothing at all.
  test('control: the member can still edit their own display name', async () => {
    const { supabase, userId } = await memberClient();
    const { data: before } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single();
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: before!.display_name })
      .eq('id', userId);
    expect(error, 'self-service profile edits must keep working').toBeNull();
  });

  // Both guards assert "unchanged", never a specific value — the fixture's
  // level drifts between runs (progress.spec.ts changes it) and hard-coding
  // 'duck' would make this fail for a reason that has nothing to do with RLS.
  // No cleanup branch either: if the guard holds there is nothing to undo, and
  // if it ever regresses the failure is the point.
  test('cannot promote themselves to selkie', async () => {
    const { supabase, userId } = await memberClient();
    const { data: before } = await supabase
      .from('profiles')
      .select('level')
      .eq('id', userId)
      .single();
    // Any level other than the current one — the trigger compares old to new,
    // so writing the same value back would prove nothing.
    const target = before!.level === 'selkie' ? 'frog' : 'selkie';

    const { error } = await supabase.from('profiles').update({ level: target }).eq('id', userId);

    expect(error, 'level self-promotion must be rejected').not.toBeNull();
    expect(error!.message).toContain('only paddling admins can change a member level');

    const { data: after } = await supabase
      .from('profiles')
      .select('level')
      .eq('id', userId)
      .single();
    expect(after?.level, 'level must be unchanged').toBe(before!.level);
  });

  test('cannot change their own membership status', async () => {
    const { supabase, userId } = await memberClient();
    const { data: before } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', userId)
      .single();
    const target = before!.status === 'active' ? 'lapsed' : 'active';

    const { error } = await supabase.from('profiles').update({ status: target }).eq('id', userId);

    expect(error, 'status self-service must be rejected').not.toBeNull();
    expect(error!.message).toContain('only membership admins can change a member status');

    const { data: after } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', userId)
      .single();
    expect(after?.status, 'status must be unchanged').toBe(before!.status);
  });

  test('cannot insert a confirmed sign-up and skip payment', async () => {
    const { supabase, userId } = await memberClient();
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('title', FIXTURE_TITLE)
      .limit(1)
      .single();
    expect(event, 'fixture event should exist — run the seed first').not.toBeNull();

    const { error } = await supabase
      .from('event_signups')
      .insert({ event_id: event!.id, member_id: userId, status: 'confirmed' });

    expect(error, 'self-confirmed sign-ups must be rejected').not.toBeNull();
    expect(error!.code, 'should be an RLS violation').toBe('42501');
  });
});
