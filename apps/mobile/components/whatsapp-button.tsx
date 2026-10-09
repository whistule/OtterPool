import { Image, Linking, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

// WhatsApp teal, darkened just enough for white text to pass AA (4.8:1) —
// their brand #128C7E falls short (4.1:1).
const WHATSAPP_GREEN = '#0F8073';
// White glyph from Simple Icons (CC0), per WhatsApp's guidelines for links to a chat.
const WHATSAPP_GLYPH = require('@/assets/images/whatsapp.png');

type Props = {
  url: string;
  label?: string;
  testID?: string;
  style?: ViewStyle;
  /** Pill-sized, to sit beside a status pill on a list card. */
  compact?: boolean;
};

// The green "Join the trip WhatsApp" button, opening the group invite link.
export function WhatsAppButton({
  url,
  label = 'Join the trip WhatsApp',
  testID,
  style,
  compact = false,
}: Props) {
  return (
    <Pressable
      accessibilityRole="link"
      testID={testID}
      hitSlop={compact ? 8 : undefined}
      onPress={() => Linking.openURL(url).catch(() => {})}
      style={({ pressed }) => [
        styles.btn,
        compact && styles.btnCompact,
        style,
        { opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <Image source={WHATSAPP_GLYPH} style={compact ? styles.glyphCompact : styles.glyph} />
      <Text style={[styles.text, compact && styles.textCompact]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: WHATSAPP_GREEN,
  },
  btnCompact: {
    gap: 6,
    height: 30,
    paddingVertical: 0,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  glyph: { width: 20, height: 20 },
  glyphCompact: { width: 14, height: 14 },
  text: { color: '#fff', fontSize: 16, fontWeight: '700' },
  textCompact: { fontSize: 12 },
});
