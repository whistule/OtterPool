// "Sat, 5 May · 14:30"
export function formatShortDateTime(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

// "5 May"
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
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
  const endDay = end.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return `${formatShortDateTime(startIso)} → ${endDay}`;
}
