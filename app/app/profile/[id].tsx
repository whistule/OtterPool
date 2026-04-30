import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, GreyBox, Pill, Row, SectionTitle } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';

type ProfileRow = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  level: 'frog' | 'duck' | 'otter' | 'dolphin' | 'selkie';
  status: 'active' | 'aspirant' | 'lapsed' | 'suspended';
  created_at: string;
};

const LEVEL_EMOJI: Record<string, string> = {
  frog: '🐸',
  duck: '🦆',
  otter: '🦦',
  dolphin: '🐬',
  selkie: '🦭',
};

const STATUS_COLOR: Record<string, string> = {
  active: OtterPalette.forest,
  aspirant: OtterPalette.lochPool,
  lapsed: OtterPalette.burntOrange,
  suspended: OtterPalette.ice,
};

function formatJoined(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export default function MemberProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const palette = Colors[useColorScheme() ?? 'light'];

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, display_name, level, status, created_at')
        .eq('id', id)
        .maybeSingle();
      if (active) {
        setProfile((data as ProfileRow) ?? null);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
        <Header onBack={() => router.back()} />
        <View style={styles.center}>
          <ActivityIndicator color={palette.tint} />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
        <Header onBack={() => router.back()} />
        <Card>
          <Text style={[styles.errTitle, { color: OtterPalette.ice }]}>Member not found</Text>
        </Card>
      </SafeAreaView>
    );
  }

  const name = profile.display_name ?? profile.full_name ?? 'Member';
  const levelEmoji = LEVEL_EMOJI[profile.level] ?? '';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Header onBack={() => router.back()} />

        <Card>
          <Row style={{ gap: 14 }}>
            <GreyBox height={64} style={{ width: 64, borderRadius: 32 }} label={levelEmoji} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: palette.text }]}>{name}</Text>
              {profile.full_name && profile.display_name &&
              profile.full_name !== profile.display_name ? (
                <Text style={[styles.muted, { color: palette.muted, marginTop: 2 }]}>
                  {profile.full_name}
                </Text>
              ) : null}
              <Row style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <Pill
                  label={`${levelEmoji} ${profile.level}`}
                  color={OtterPalette.slateNavy}
                />
                <Pill
                  label={profile.status}
                  color={STATUS_COLOR[profile.status] ?? OtterPalette.lochPool}
                />
              </Row>
            </View>
          </Row>
        </Card>

        <SectionTitle>Member since</SectionTitle>
        <Card>
          <Text style={[styles.body, { color: palette.text }]}>
            {formatJoined(profile.created_at)}
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={[styles.header, { backgroundColor: OtterPalette.slateNavy }]}>
      <Pressable onPress={onBack} style={styles.backBtn}>
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>
      <Text style={styles.headerWordmark}>OtterPool</Text>
      <View style={styles.backBtn} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  backBtn: { paddingHorizontal: 8, paddingVertical: 4, minWidth: 56 },
  backText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  headerWordmark: { color: '#fff', fontSize: 14, fontStyle: 'italic', opacity: 0.85 },
  name: { fontSize: 20, fontWeight: '700' },
  muted: { fontSize: 12 },
  body: { fontSize: 14 },
  errTitle: { fontSize: 14, fontWeight: '700' },
});
