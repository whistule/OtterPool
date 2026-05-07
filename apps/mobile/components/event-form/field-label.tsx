import React from 'react';
import { Text } from 'react-native';

import { OtterPalette } from '@/constants/theme';

export function FieldLabel({
  children,
  palette,
  style,
}: {
  children: React.ReactNode;
  palette: { text: string };
  style?: object;
}) {
  return (
    <Text
      style={[
        { fontSize: 12, fontWeight: '700', marginBottom: 6, color: palette.text },
        style,
      ]}>
      {children}
    </Text>
  );
}

export function FieldError({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <Text style={{ color: OtterPalette.ice, fontSize: 12, marginTop: 6 }}>{text}</Text>
  );
}
