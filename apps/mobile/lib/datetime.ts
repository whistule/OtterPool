function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// "Sat, 5 May"
export function formatDayLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// "14:30"
export function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// "Sat, 5 May · 14:30"
export function formatDateTime(d: Date): string {
  return `${formatDayLabel(d)} · ${formatTime(d)}`;
}

export function formatShortDateTime(iso: string): string {
  return formatDateTime(new Date(iso));
}

// "5 May"
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Compact range for list rows: single-day events show the start only;
// multi-day events show "Sat, 21 Jun · 18:30 → Mon, 23 Jun".
export function formatShortRange(startIso: string, endIso: string | null): string {
  if (!endIso) {
    return formatShortDateTime(startIso);
  }
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (isSameDay(start, end)) {
    return formatShortDateTime(startIso);
  }
  return `${formatShortDateTime(startIso)} → ${formatDayLabel(end)}`;
}

// Fuller range for the event detail screen, which has room to show the end
// time: "Sat, 5 May · 14:30–16:30" for a single day, otherwise both ends.
export function formatFullRange(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  if (!endIso) {
    return formatDateTime(start);
  }
  const end = new Date(endIso);
  if (isSameDay(start, end)) {
    return `${formatDayLabel(start)} · ${formatTime(start)}–${formatTime(end)}`;
  }
  return `${formatDateTime(start)} → ${formatDateTime(end)}`;
}
