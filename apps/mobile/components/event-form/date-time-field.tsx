import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React from 'react';
import { Platform, Pressable, Text } from 'react-native';

import { formatDateTime } from '@/lib/datetime';
import { toLocalIsoMinutes } from '@/lib/event-form-utils';

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
    <NativeDateTimeField
      value={value}
      onChange={onChange}
      style={style}
      placeholderColor={placeholderColor}
    />
  );
}

// Native has no `datetime-local`, so this used to be a bare TextInput that made
// you type "YYYY-MM-DDTHH:MM" by hand on a phone keyboard. Tapping now opens the
// OS date picker, then the OS time picker, and writes back the same string the
// web input produces — validation, series generation and submit are unchanged.
function NativeDateTimeField({ value, onChange, style, placeholderColor }: DateTimeFieldProps) {
  // A date-time string with no offset parses as LOCAL time, which is what the
  // rest of the form assumes. Keep it that way — appending 'Z' here would shift
  // every event by the UTC offset.
  const parsed = value ? new Date(value) : null;
  const current = parsed && !isNaN(parsed.getTime()) ? parsed : null;

  const [picking, setPicking] = React.useState<null | 'date' | 'time'>(null);
  // Holds the date half between the two steps, so the time picker can merge
  // into the day the user just chose rather than the previous value's day.
  const [draft, setDraft] = React.useState<Date | null>(null);

  const handleDate = (event: DateTimePickerEvent, picked?: Date) => {
    if (event.type !== 'set' || !picked) {
      setPicking(null);
      return;
    }
    setDraft(picked);
    setPicking('time');
  };

  const handleTime = (event: DateTimePickerEvent, picked?: Date) => {
    setPicking(null);
    if (event.type !== 'set' || !picked) {
      return;
    }
    const base = draft ?? current ?? new Date();
    const merged = new Date(base);
    merged.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    onChange(toLocalIsoMinutes(merged));
  };

  const flat: Record<string, unknown> = Array.isArray(style)
    ? Object.assign({}, ...style)
    : (style as Record<string, unknown>);

  return (
    <>
      <Pressable onPress={() => setPicking('date')} style={style as never}>
        <Text style={{ fontSize: 15, color: (current ? flat.color : placeholderColor) as string }}>
          {current ? formatDateTime(current) : 'Pick a date and time'}
        </Text>
      </Pressable>
      {picking === 'date' ? (
        <DateTimePicker value={current ?? new Date()} mode="date" onChange={handleDate} />
      ) : null}
      {picking === 'time' ? (
        <DateTimePicker
          value={draft ?? current ?? new Date()}
          mode="time"
          onChange={handleTime}
          // The club runs on 24h time and the rest of the app formats that way.
          is24Hour
        />
      ) : null}
    </>
  );
}
