import type { Session, User } from '@supabase/supabase-js';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import type { ExperienceAnswers } from './experience';
import { emailKey, type ListRow, memberStatus } from './membership';
import { registerForPushNotifications } from './notifications';
import type { MemberStatus } from './status';
import { supabase } from './supabase';

// A password-recovery link signs the user in so the reset screen can call
// updateUser. That session is only good for setting a password, so it must not
// outlive the screen. On web, leaving is a full page reload (no unmount runs),
// so the flag is persisted rather than kept in memory only.
const RECOVERY_KEY = 'otterpool.recovery-pending';
let recoveryPending = false;

export function setRecoveryPending(pending: boolean) {
  recoveryPending = pending;
  if (Platform.OS !== 'web') {
    return;
  }
  if (pending) {
    window.localStorage.setItem(RECOVERY_KEY, '1');
  } else {
    window.localStorage.removeItem(RECOVERY_KEY);
  }
}

export function isRecoveryPending() {
  if (recoveryPending) {
    return true;
  }
  return Platform.OS === 'web' && window.localStorage.getItem(RECOVERY_KEY) === '1';
}

export type Profile = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  level: 'frog' | 'duck' | 'otter' | 'dolphin' | 'selkie';
  status: MemberStatus;
  is_admin: boolean;
  is_membership_admin: boolean;
  is_paddling_admin: boolean;
  phone: string | null;
  dob: string | null;
  bc_membership_no: string | null;
  experience_answers: ExperienceAnswers | null;
  experience_review_requested: boolean;
  experience_submitted_at: string | null;
  experience_reviewed_at: string | null;
  avatar_path: string | null;
};

export type Membership = { status: MemberStatus; expires_on: string | null; trials_used: number };

/**
 * The signed-in member's own status and expiry. RLS lets a member read only
 * their own verified_members row (matched on their JWT email), so the email
 * list never reaches the client.
 */
async function fetchMyStatus(
  user: User,
): Promise<{ status: MemberStatus; expires_on: string | null }> {
  const [profRes, listRes] = await Promise.all([
    supabase.from('profiles').select('status_override').eq('id', user.id).maybeSingle(),
    supabase
      .from('verified_members')
      .select('expires_on')
      .eq('email_norm', emailKey(user.email))
      .maybeSingle(),
  ]);
  const override =
    (profRes.data as { status_override: MemberStatus | null } | null)?.status_override ?? null;
  const listed = (listRes.data as ListRow | null) ?? null;
  return { status: memberStatus(override, listed), expires_on: listed?.expires_on ?? null };
}

/** Status, expiry and trial places held — what the popup and banner show. */
export async function fetchMyMembership(session: Session): Promise<Membership> {
  const [mine, trials] = await Promise.all([
    fetchMyStatus(session.user),
    supabase
      .from('event_signups')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', session.user.id)
      .in('status', ['confirmed', 'pending_payment', 'pending_review', 'waitlisted']),
  ]);
  return { ...mine, trials_used: trials.count ?? 0 };
}

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (user: User) => {
    const userId = user.id;
    // Sensitive fields live in member_private (self/admin-only); merge the
    // member's own private row into the in-memory profile.
    const [profRes, privRes, mine] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'id, full_name, display_name, level, is_admin, is_membership_admin, is_paddling_admin, avatar_path',
        )
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('member_private')
        .select(
          'phone, dob, bc_membership_no, experience_answers, experience_review_requested, experience_submitted_at, experience_reviewed_at',
        )
        .eq('member_id', userId)
        .maybeSingle(),
      fetchMyStatus(user),
    ]);
    if (!profRes.error && profRes.data) {
      const priv = privRes.data ?? {};
      setProfile({
        ...(profRes.data as Omit<
          Profile,
          | 'status'
          | 'phone'
          | 'dob'
          | 'bc_membership_no'
          | 'experience_answers'
          | 'experience_review_requested'
          | 'experience_submitted_at'
          | 'experience_reviewed_at'
        >),
        status: mine.status,
        phone: (priv as { phone?: string | null }).phone ?? null,
        dob: (priv as { dob?: string | null }).dob ?? null,
        bc_membership_no: (priv as { bc_membership_no?: string | null }).bc_membership_no ?? null,
        experience_answers:
          (priv as { experience_answers?: ExperienceAnswers | null }).experience_answers ?? null,
        experience_review_requested:
          (priv as { experience_review_requested?: boolean | null }).experience_review_requested ??
          false,
        experience_submitted_at:
          (priv as { experience_submitted_at?: string | null }).experience_submitted_at ?? null,
        experience_reviewed_at:
          (priv as { experience_reviewed_at?: string | null }).experience_reviewed_at ?? null,
      });
    } else if (!profRes.error) {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let active = true;

    // The supabase client occasionally settles into a state where
    // getSession() never resolves (seen on web after hard-reloads mid-test).
    // Subscribing to onAuthStateChange is enough on its own — it fires an
    // INITIAL_SESSION event with the persisted session as soon as we
    // subscribe. Use getSession only as a kicker; either path flips
    // `loading` to false on the first signal we get back.
    const finishLoading = (newSession: Session | null) => {
      if (!active) {
        return;
      }
      setSession(newSession);
      setLoading(false);
      if (newSession) {
        loadProfile(newSession.user);
        registerForPushNotifications().catch((e) => {
          console.warn('[push] registration failed:', e);
        });
      } else {
        setProfile(null);
      }
    };

    supabase.auth
      .getSession()
      .then(({ data }) => finishLoading(data.session))
      .catch(() => finishLoading(null));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      finishLoading(newSession);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (session) {
      await loadProfile(session.user);
    }
  }, [session, loadProfile]);

  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export type RoleFlags = {
  superAdmin: boolean;
  membershipAdmin: boolean;
  paddlingAdmin: boolean;
  anyAdmin: boolean;
};

// Resolve a profile's admin role flags. Super admin (is_admin) implies every
// role. Accepts any object carrying the three flags (Profile or a row type).
export function roleFlags(
  p: {
    is_admin?: boolean | null;
    is_membership_admin?: boolean | null;
    is_paddling_admin?: boolean | null;
  } | null,
): RoleFlags {
  const superAdmin = !!p?.is_admin;
  const membershipAdmin = superAdmin || !!p?.is_membership_admin;
  const paddlingAdmin = superAdmin || !!p?.is_paddling_admin;
  return { superAdmin, membershipAdmin, paddlingAdmin, anyAdmin: membershipAdmin || paddlingAdmin };
}
