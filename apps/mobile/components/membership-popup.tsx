import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { OtterPalette } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { MEMBERMOJO_JOIN_URL, MEMBERMOJO_RENEW_URL } from './membership-banner';

const TRIAL_LIMIT = 3;
const EXPIRY_WARN_DAYS = 42; // 6 weeks
const VERIFIED_DISMISS_KEY = 'op_membership_verified_popup_dismissed';

// Once the popup is closed we don't reopen it for the rest of the app session
// (survives tab switches — module scope outlives the screen). The "verified"
// confirmation is additionally remembered across sessions via localStorage.
let closedThisSession = false;

type Membership = { status: string; expires_on: string | null; trials_used: number };

function openExternal(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank');
    return;
  }
  Linking.openURL(url).catch(() => {});
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${dateStr}T00:00:00`).getTime() - today.getTime()) / 86_400_000);
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function verifiedDismissed(): boolean {
  try {
    return (
      typeof localStorage !== 'undefined' && localStorage.getItem(VERIFIED_DISMISS_KEY) === '1'
    );
  } catch {
    return false;
  }
}

type Popup = {
  title: string;
  sub: string;
  pips?: { used: number; total: number };
  note?: string;
  primary?: { label: string; onPress: () => void };
  isVerified?: boolean;
};

function buildPopup(m: Membership): Popup | null {
  if (m.status === 'suspended') {
    return { title: 'Account suspended', sub: 'Please contact the club to sort this out.' };
  }
  if (m.status === 'lapsed') {
    return {
      title: 'Your membership has lapsed',
      sub: 'Renew your DCKC membership to sign up for events again.',
      primary: { label: 'Renew now', onPress: () => openExternal(MEMBERMOJO_RENEW_URL) },
    };
  }
  if (m.status === 'aspirant') {
    const used = Math.min(m.trials_used, TRIAL_LIMIT);
    const left = Math.max(0, TRIAL_LIMIT - used);
    return {
      title: 'Welcome to DCKC 🦦',
      sub:
        left === 0
          ? `You've used all ${TRIAL_LIMIT} of your trial sessions. Join DCKC to keep paddling with us.`
          : `You've used ${used} of your ${TRIAL_LIMIT} trial sessions. Join DCKC to keep paddling with us.`,
      pips: { used, total: TRIAL_LIMIT },
      note:
        left === 0
          ? 'Membership required to keep signing up'
          : `${left} left before membership required`,
      primary: { label: 'Join DCKC now', onPress: () => openExternal(MEMBERMOJO_JOIN_URL) },
    };
  }
  // active
  const expires = m.expires_on;
  if (expires) {
    const days = daysUntil(expires);
    if (days >= 0 && days <= EXPIRY_WARN_DAYS) {
      return {
        title: 'Membership renewal due',
        sub: `Your DCKC membership lapses on ${formatDate(expires)}. Renew now so you don’t lose access to events.`,
        primary: { label: 'Renew now', onPress: () => openExternal(MEMBERMOJO_RENEW_URL) },
      };
    }
  }
  return {
    title: 'You’re a verified DCKC member ✓',
    sub: expires
      ? `Your membership is valid until ${formatDate(expires)}.`
      : 'Thanks for being a member!',
    isVerified: true,
  };
}

/**
 * A bottom-sheet membership popup, modelled on the prototype's "Welcome back"
 * card. Shown once per app session on the screen it's mounted (Calendar) so the
 * status doesn't eat space inline; the verified confirmation is shown only once
 * ever. Closeable via "Maybe later".
 */
export function MembershipPopup() {
  const { session } = useAuth();
  const [popup, setPopup] = useState<Popup | null>(null);

  useEffect(() => {
    if (!session || closedThisSession) {
      return;
    }
    let active = true;
    supabase.rpc('my_membership').then(({ data }) => {
      if (!active || !data) {
        return;
      }
      const built = buildPopup(data as Membership);
      if (!built) {
        return;
      }
      if (built.isVerified && verifiedDismissed()) {
        return;
      }
      setPopup(built);
    });
    return () => {
      active = false;
    };
  }, [session]);

  if (!popup) {
    return null;
  }

  const close = () => {
    closedThisSession = true;
    if (popup.isVerified) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(VERIFIED_DISMISS_KEY, '1');
        }
      } catch {
        // ignore
      }
    }
    setPopup(null);
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.top}>
          <Text style={styles.title}>{popup.title}</Text>
          <Text style={styles.sub}>{popup.sub}</Text>
        </View>
        <View style={styles.body}>
          {popup.pips || popup.note ? (
            <View style={styles.sessions}>
              {popup.pips ? (
                <View style={styles.pips}>
                  {Array.from({ length: popup.pips.total }, (_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.pip,
                        i < (popup.pips?.used ?? 0)
                          ? { backgroundColor: OtterPalette.burntOrange }
                          : null,
                      ]}
                    />
                  ))}
                </View>
              ) : null}
              {popup.note ? <Text style={styles.note}>{popup.note}</Text> : null}
            </View>
          ) : null}
          <View style={styles.btns}>
            {popup.primary ? (
              <Pressable
                testID="membership-popup-primary"
                onPress={() => {
                  popup.primary?.onPress();
                  close();
                }}
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryText}>{popup.primary.label}</Text>
              </Pressable>
            ) : null}
            <Pressable
              testID="membership-popup-dismiss"
              onPress={close}
              style={styles.secondaryBtn}
            >
              <Text style={styles.secondaryText}>{popup.primary ? 'Maybe later' : 'Close'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(20,26,20,0.55)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 16,
    zIndex: 200,
  },
  card: {
    width: '100%',
    maxWidth: 430,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  top: {
    backgroundColor: OtterPalette.forest,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#f4f5f2', marginBottom: 6 },
  sub: { fontSize: 13, lineHeight: 19, color: 'rgba(244,245,242,0.75)', fontStyle: 'italic' },
  body: { padding: 18, gap: 14 },
  sessions: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  pips: { flexDirection: 'row', gap: 6 },
  pip: { width: 30, height: 8, borderRadius: 4, backgroundColor: '#d9d9d2' },
  note: { fontSize: 13, color: '#5a6066', flex: 1 },
  btns: { flexDirection: 'row', gap: 10 },
  primaryBtn: {
    flex: 1,
    backgroundColor: OtterPalette.forest,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#d9d9d2',
    borderRadius: 8,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: '#5a6066', fontSize: 13, fontWeight: '600' },
});
