import { Image } from 'expo-image';
import React from 'react';
import { ImageStyle, StyleSheet, Text, View, ViewStyle, StyleProp } from 'react-native';

import { publicUrl } from '@/lib/photos';

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
  const url = publicUrl('avatars', path);
  const dim: ImageStyle = { width: size, height: size, borderRadius: size / 2 };
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[dim, style as StyleProp<ImageStyle>]}
        contentFit="cover"
        transition={120}
      />
    );
  }
  return (
    <View style={[styles.fallback, dim, style]}>
      <Text style={{ fontSize: Math.round(size * 0.55) }}>{fallback ?? '🦦'}</Text>
    </View>
  );
}

/** Rectangular event/hero photo. Falls back to a tinted placeholder. */
export function EventPhoto({
  path,
  height = 140,
  thumb = false,
  style,
}: {
  path: string | null | undefined;
  height?: number;
  thumb?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const url = publicUrl('event-photos', path);
  const radius = thumb ? 10 : 14;
  const baseStyle: ImageStyle = { height, borderRadius: radius, width: thumb ? height : '100%' };
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[baseStyle, style as StyleProp<ImageStyle>]}
        contentFit="cover"
        transition={120}
      />
    );
  }
  return (
    <View style={[styles.placeholder, baseStyle, style]}>
      <Text style={styles.placeholderLabel}>{thumb ? '📷' : 'event photo'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: '#e3e1dc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    backgroundColor: '#e3e1dc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderLabel: {
    fontSize: 12,
    color: '#6b7178',
  },
});
