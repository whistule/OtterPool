import React from 'react';
import { Platform, TextInput } from 'react-native';

type DateTimeFieldProps = {
  value: string;
  onChange: (v: string) => void;
  style: object | object[];
  placeholderColor: string;
};

export function DateTimeField({ value, onChange, style, placeholderColor }: DateTimeFieldProps) {
  if (Platform.OS === 'web') {
    const flat: Record<string, unknown> = Array.isArray(style)
      ? Object.assign({}, ...style)
      : (style as Record<string, unknown>);
    const css: React.CSSProperties = {
      boxSizing: 'border-box',
      width: '100%',
      fontFamily: 'inherit',
      fontSize: 15,
      lineHeight: '20px',
      paddingTop: 12,
      paddingBottom: 12,
      paddingLeft: 12,
      paddingRight: 12,
      borderRadius: 10,
      borderStyle: 'solid',
      borderWidth: (flat.borderWidth as number) ?? 1,
      borderColor: (flat.borderColor as string) ?? '#ccc',
      color: (flat.color as string) ?? 'inherit',
      backgroundColor: 'transparent',
      outline: 'none',
    };
    return React.createElement('input', {
      type: 'datetime-local',
      value,
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      style: css,
    });
  }
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      autoCapitalize="none"
      placeholder="YYYY-MM-DDTHH:MM"
      placeholderTextColor={placeholderColor}
      style={style as never}
    />
  );
}
