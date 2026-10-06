import { Tabs, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadAttention } from '@/lib/attention';
import { roleFlags, useAuth } from '@/lib/auth';

// Emoji tab icons were small and faint (easy to miss, especially on web where
// there's no touch target cue). Bigger, and only lightly dimmed when inactive.
const ICON_BASE = Platform.OS === 'web' ? 30 : 26;

function EmojiIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: focused ? ICON_BASE + 4 : ICON_BASE, opacity: focused ? 1 : 0.7 }}>
      {emoji}
    </Text>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const barHeight = (Platform.OS === 'web' ? 72 : 60) + insets.bottom;
  const { session, profile } = useAuth();
  const userId = session?.user.id ?? null;
  const paddlingAdmin = roleFlags(profile).paddlingAdmin;
  const pathname = usePathname();
  const [attentionCount, setAttentionCount] = useState(0);

  // ponytail: recounts on every navigation (three small queries); move to a
  // shared store if the inbox ever needs to update without the user moving.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the refresh trigger
  useEffect(() => {
    if (!userId) {
      setAttentionCount(0);
      return;
    }
    let active = true;
    loadAttention(userId, paddlingAdmin).then((res) => {
      if (active) {
        setAttentionCount(res.items.length);
      }
    });
    return () => {
      active = false;
    };
  }, [userId, paddlingAdmin, pathname]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: palette.tabIconSelected,
        tabBarInactiveTintColor: palette.tabIconDefault,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
          height: barHeight,
          paddingBottom: insets.bottom + 6,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ focused }) => <EmojiIcon emoji="📅" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="my-trips"
        options={{
          title: 'My Trips',
          tabBarIcon: ({ focused }) => <EmojiIcon emoji="🛶" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarBadge: attentionCount > 0 ? attentionCount : undefined,
          tabBarIcon: ({ focused }) => <EmojiIcon emoji="🔔" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          href: null,
          title: 'Progress',
          tabBarIcon: ({ focused }) => <EmojiIcon emoji="🦦" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <EmojiIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
