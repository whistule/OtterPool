import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { OtterPalette } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// DCKC's MemberMojo pages. Renewals go to the renew page; new joiners go to
// the club's MemberMojo home, which offers the join options.
export const MEMBERMOJO_RENEW_URL = 'https://membermojo.co.uk/dckc/renew';
export const MEMBERMOJO_JOIN_URL = 'https://membermojo.co.uk/dckc';

const TRIAL_LIMIT = 3;
const EXPIRY_WARN_DAYS = 42; // 6 weeks
const VERIFIED_DISMISS_KEY = 'op_membership_verified_dismissed';

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
  const target = new Date(`${dateStr}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

type BannerContent = {
  tone: string;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
  onDismiss?: () => void;
};

/**
 * A one-line membership status banner: confirms verified members, warns when a
 * membership is near expiry, nudges aspirants through their trial, and points
 * lapsed/suspended members at the fix. Reads the caller's own snapshot from
 * `my_membership()` (status + expiry + trial count).
 */
export function MembershipBanner() {
  const { session, profile } = useAuth();
  const [snapshot, setSnapshot] = useState<Membership | null>(null);
  const [verifiedDismissed, setVerifiedDismissed] = useState(false);

  useEffect(() => {
    if (!session) {
      return;
    }
    let active = true;
    supabase.rpc('my_membership').then(({ data }) => {
      if (active && data) {
        setSnapshot(data as Membership);
      }
    });
    try {
      if (
        typeof localStorage !== 'undefined' &&
        localStorage.getItem(VERIFIED_DISMISS_KEY) === '1'
      ) {
        setVerifiedDismissed(true);
      }
    } catch {
      // Private mode / blocked storage — just show it.
    }
    return () => {
      active = false;
    };
  }, [session]);

  const status = snapshot?.status ?? profile?.status;
  if (!session || !status) {
    return null;
  }

  const openJoin = () => openExternal(MEMBERMOJO_JOIN_URL);
  const openRenew = () => openExternal(MEMBERMOJO_RENEW_URL);
  const content = ((): BannerContent | null => {
    if (status === 'suspended') {
      return {
        tone: OtterPalette.ice,
        title: 'Your account is suspended',
        body: 'Please contact the club to sort this out.',
      };
    }
    if (status === 'lapsed') {
      return {
        tone: OtterPalette.burntOrange,
        title: 'Your DCKC membership has lapsed',
        body: 'Renew to sign up for events again.',
        action: { label: 'Renew membership', onPress: openRenew },
      };
    }
    if (status === 'aspirant') {
      const used = snapshot?.trials_used ?? 0;
      const left = Math.max(0, TRIAL_LIMIT - used);
      return left === 0
        ? {
            tone: OtterPalette.burntOrange,
            title: `You've used all ${TRIAL_LIMIT} trial events`,
            body: 'Join DCKC to keep signing up for trips.',
            action: { label: 'Join DCKC', onPress: openJoin },
          }
        : {
            tone: OtterPalette.slateNavy,
            title: `Trial member — ${left} of ${TRIAL_LIMIT} trial event${left === 1 ? '' : 's'} left`,
            body: 'You can paddle a few sessions before joining. Join anytime.',
            action: { label: 'Join DCKC', onPress: openJoin },
          };
    }
    // active
    const expires = snapshot?.expires_on ?? null;
    if (expires) {
      const days = daysUntil(expires);
      if (days >= 0 && days <= EXPIRY_WARN_DAYS) {
        return {
          tone: OtterPalette.burntOrange,
          title: `Your membership lapses on ${formatDate(expires)}`,
          body: 'Renew now so you don’t lose access to events.',
          action: { label: 'Renew membership', onPress: openRenew },
        };
      }
    }
    if (verifiedDismissed) {
      return null;
    }
    return {
      tone: OtterPalette.forest,
      title: '✓ You’re a verified DCKC member',
      body: expires ? `Membership valid until ${formatDate(expires)}.` : undefined,
      onDismiss: () => {
        setVerifiedDismissed(true);
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(VERIFIED_DISMISS_KEY, '1');
          }
        } catch {
          // ignore
        }
      },
    };
  })();

  if (!content) {
    return null;
  }

  return (
    <View style={[styles.banner, { borderColor: content.tone }]}>
      <View style={[styles.stripe, { backgroundColor: content.tone }]} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: content.tone }]}>{content.title}</Text>
          {content.onDismiss ? (
            <Pressable onPress={content.onDismiss} hitSlop={8} testID="membership-banner-dismiss">
              <Text style={[styles.dismiss, { color: content.tone }]}>✕</Text>
            </Pressable>
          ) : null}
        </View>
        {content.body ? <Text style={styles.text}>{content.body}</Text> : null}
        {content.action ? (
          <Pressable
            onPress={content.action.onPress}
            style={[styles.action, { backgroundColor: content.tone }]}
            testID="membership-banner-action"
          >
            <Text style={styles.actionText}>{content.action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  stripe: { width: 5 },
  body: { flex: 1, padding: 12, gap: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '700', flex: 1, paddingRight: 8 },
  dismiss: { fontSize: 14, fontWeight: '700' },
  text: { fontSize: 13, color: '#3a3f43', lineHeight: 18 },
  action: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginTop: 2,
  },
  actionText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
});
