import { Image } from 'expo-image';
import {
  type ImageStyle,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
  type StyleProp,
} from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { publicUrl } from '@/lib/photos';

// Both components are decorative: every avatar sits beside the member's name
// and every event photo beside the event title, so screen readers skip them
// (aria-hidden) rather than announcing an unlabelled image or a stray emoji.

/** Round avatar. Falls back to the level emoji when no avatar_path is set. */
export function Avatar({
  path,
  size = 44,
  fallback,
  style,
}: {
  path: string | null | undefined;
  size?: number;
  fallback?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = Colors[useColorScheme() ?? 'light'];
  const url = publicUrl('avatars', path);
  const dim: ImageStyle = { width: size, height: size, borderRadius: size / 2 };
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[dim, style as StyleProp<ImageStyle>]}
        aria-hidden
        contentFit="cover"
        transition={120}
      />
    );
  }
  return (
    <View
      aria-hidden
      style={[styles.fallback, { backgroundColor: palette.placeholder }, dim, style]}
    >
      <Text style={{ fontSize: Math.round(size * 0.55) }}>{fallback ?? '🦦'}</Text>
    </View>
  );
}

/**
 * Rectangular event/hero photo. Without a photo it falls back to a block of
 * `color` (the event's discipline colour) so cards still read at a glance.
 */
export function EventPhoto({
  path,
  height = 140,
  thumb = false,
  color,
  style,
}: {
  path: string | null | undefined;
  height?: number;
  thumb?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = Colors[useColorScheme() ?? 'light'];
  const url = publicUrl('event-photos', path);
  const radius = thumb ? 10 : 14;
  const baseStyle: ImageStyle = { height, borderRadius: radius, width: thumb ? height : '100%' };
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[baseStyle, style as StyleProp<ImageStyle>]}
        aria-hidden
        contentFit="cover"
        transition={120}
      />
    );
  }
  return (
    <View
      aria-hidden
      style={[
        styles.placeholder,
        { backgroundColor: color ?? palette.placeholder },
        baseStyle,
        style,
      ]}
    >
      {thumb ? <Text style={{ fontSize: Math.round(height * 0.45) }}>🛶</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
