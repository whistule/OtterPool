import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

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
        name="progress"
        options={{
          href: null,
          title: 'Progress',
          tabBarIcon: ({ focused }) => <EmojiIcon emoji="🦦" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="notify"
        options={{
          title: 'Notify',
          tabBarIcon: ({ focused }) => <EmojiIcon emoji="🔔" focused={focused} />,
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
