// About: what OtterPool is, the progression ladder it tracks, what it's built
// on, and what it does with member data.

import Constants from 'expo-constants';
import { router } from 'expo-router';
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header } from '@/components/header';
import { PageTitle } from '@/components/page-title';
import { Card, Row, SectionTitle } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { LEVEL_DESC, LEVEL_EMOJI, LEVEL_LABEL, LEVEL_ORDER } from '@/lib/progress';

const REPO = 'https://github.com/whistule/OtterPool';

type Credit = { what: string; detail: string; url?: string };

const CREDITS: Credit[] = [
  {
    what: 'App framework',
    detail: 'Expo and React Native, with expo-router for navigation.',
    url: 'https://expo.dev/',
  },
  {
    what: 'Accounts, database and files',
    detail:
      'Supabase — Postgres with row-level security, authentication, storage for photos, and the edge functions behind sign-up and payment.',
    url: 'https://supabase.com/',
  },
  {
    what: 'Payments',
    detail:
      'Stripe Checkout. Card details are entered on Stripe’s own pages — they never reach OtterPool or the club.',
    url: 'https://stripe.com/',
  },
  {
    what: 'Notifications',
    detail: 'Expo push notifications for trip alerts, sign-up decisions and reminders.',
    url: 'https://docs.expo.dev/push-notifications/overview/',
  },
];

export default function AboutScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const version = Constants.expoConfig?.version ?? '';

  const open = (url?: string) => {
    if (url) {
      Linking.openURL(url).catch(() => {});
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
      <PageTitle title="About" />
      <Header onBack={() => router.back()} title="About" />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Card>
          <Text style={[styles.appName, { color: palette.text }]}>OtterPool 🦦</Text>
          {version ? (
            <Text style={[styles.muted, { color: palette.muted, marginTop: 2 }]}>
              Version {version}
            </Text>
          ) : null}
          <Text style={[styles.body, { color: palette.text, marginTop: 10 }]}>
            The club app for Drumchapel and Clydebank Kayak Club. It carries the trip calendar,
            sign-ups and payments, and is the club’s record of membership and paddling experience.
          </Text>
        </Card>

        <SectionTitle>The progression ladder</SectionTitle>
        <Card>
          <Text style={[styles.muted, { color: palette.muted, marginBottom: 10 }]}>
            Your level sets which trips you can join. Only a Paddling Admin can move you up.
          </Text>
          {LEVEL_ORDER.map((l, i) => (
            <Row
              key={l}
              style={[
                styles.levelRow,
                i < LEVEL_ORDER.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: palette.border,
                },
              ]}
            >
              <Text style={styles.levelEmoji}>{LEVEL_EMOJI[l]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.value, { color: palette.text }]}>{LEVEL_LABEL[l]}</Text>
                <Text style={[styles.muted, { color: palette.muted, marginTop: 2 }]}>
                  {LEVEL_DESC[l]}
                </Text>
              </View>
            </Row>
          ))}
        </Card>

        <SectionTitle>Your information</SectionTitle>
        <Card>
          <Text style={[styles.body, { color: palette.text }]}>
            Medical notes and emergency contacts are shared with your trip leader from the event
            start until midnight the following day. Membership admins can see them to keep your
            record straight. Other members only ever see your name, level and photo.
          </Text>
        </Card>

        <SectionTitle>On the water</SectionTitle>
        <Card>
          <Text style={[styles.body, { color: palette.text }]}>
            Trip grades and minimum levels are a guide to what a trip is likely to involve — they
            aren’t a promise about the conditions on the day. The leader’s call on the water always
            comes first, and you are responsible for your own kit, skills and decision to paddle.
          </Text>
        </Card>

        <SectionTitle>Built with</SectionTitle>
        <Card>
          {CREDITS.map((c, i) => (
            <Pressable
              key={c.what}
              onPress={() => open(c.url)}
              disabled={!c.url}
              accessibilityRole={c.url ? 'button' : undefined}
              accessibilityLabel={
                c.url ? `${c.what}. ${c.detail} Opens in your browser.` : undefined
              }
              style={[
                styles.creditRow,
                i < CREDITS.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: palette.border,
                },
              ]}
            >
              <Text style={[styles.value, { color: palette.text }]}>{c.what}</Text>
              <Text style={[styles.muted, { color: palette.muted, marginTop: 3 }]}>{c.detail}</Text>
              {c.url ? (
                <Text style={[styles.muted, { color: OtterPalette.slateNavy, marginTop: 3 }]}>
                  {c.url.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗
                </Text>
              ) : null}
            </Pressable>
          ))}
        </Card>

        <SectionTitle>Source</SectionTitle>
        <Pressable
          onPress={() => open(REPO)}
          accessibilityRole="button"
          accessibilityLabel="View the OtterPool source on GitHub"
          testID="about-source-link"
        >
          <Card>
            <Text style={[styles.value, { color: OtterPalette.slateNavy }]}>
              View the source on GitHub ↗
            </Text>
            <Text style={[styles.muted, { color: palette.muted, marginTop: 3 }]}>
              {REPO.replace(/^https?:\/\//, '')}
            </Text>
          </Card>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  appName: { fontSize: 22, fontWeight: '800' },
  value: { fontSize: 15, fontWeight: '600' },
  muted: { fontSize: 12 },
  body: { fontSize: 14, lineHeight: 20 },
  levelRow: { paddingVertical: 10, gap: 12, alignItems: 'center' },
  levelEmoji: { fontSize: 26 },
  creditRow: { paddingVertical: 12 },
});
