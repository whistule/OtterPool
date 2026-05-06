import { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { supabase } from './supabase';

export type Profile = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  level: 'frog' | 'duck' | 'otter' | 'dolphin' | 'selkie';
  status: 'active' | 'aspirant' | 'lapsed' | 'suspended';
  is_admin: boolean;
  phone: string | null;
  dob: string | null;
  bc_membership_no: string | null;
  medical_notes: string | null;
  photo_url: string | null;
};

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

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, full_name, display_name, level, status, is_admin, phone, dob, bc_membership_no, medical_notes, photo_url',
      )
      .eq('id', userId)
      .maybeSingle();
    if (!error) setProfile((data as Profile) ?? null);
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
      if (!active) return;
      setSession(newSession);
      setLoading(false);
      if (newSession) loadProfile(newSession.user.id);
      else setProfile(null);
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
    if (session) await loadProfile(session.user.id);
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
