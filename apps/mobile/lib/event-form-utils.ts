import { OtterPalette } from '@/constants/theme';
import { PINKSTON_GRADES, RIVER_GRADES, SEA_GRADES } from '@/lib/progress';

export type Category = {
  id: number;
  name: string;
  default_min_level: 'frog' | 'duck' | 'otter' | 'dolphin' | 'selkie';
  default_cost: number;
};

export type FieldKey =
  | 'title'
  | 'category'
  | 'startsAt'
  | 'duration'
  | 'maxParticipants'
  | 'cost'
  | 'repeatCount';

export type Status = 'open' | 'full' | 'closed' | 'cancelled';

export type LoadedEvent = {
  id: string;
  title: string;
  category_id: number;
  description: string | null;
  grade_advertised: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  meeting_point: string | null;
  min_level: 'frog' | 'duck' | 'otter' | 'dolphin' | 'selkie';
  max_participants: number | null;
  cost: number;
  approval_mode: 'auto' | 'manual_all';
  status: 'draft' | Status;
  leader_id: string;
  photo_path: string | null;
};

export type CategoryGroup = {
  label: string;
  items: { category: Category; label: string }[];
};

export const LEVELS: ('frog' | 'duck' | 'otter' | 'dolphin')[] = [
  'frog',
  'duck',
  'otter',
  'dolphin',
];

export const STATUS_OPTIONS: { value: Status; label: string; color: string }[] = [
  { value: 'open', label: 'Open', color: OtterPalette.forest },
  { value: 'closed', label: 'Closed', color: OtterPalette.lochPool },
  { value: 'cancelled', label: 'Cancelled', color: OtterPalette.ice },
];

export const CATEGORY_TITLE_HINTS: Record<string, string> = {
  'Tuesday Evening - Loch Lomond': 'Tuesday Evening — Balmaha',
  'Tuesday Evening - All Away': 'Tuesday Away — Loch Tay',
  'Night Paddle': 'Night Paddle — Bardowie',
  Pinkston: 'Pinkston · pump session',
  'Pool / Loch Sessions': 'Pool session — Bellahouston',
  'River Trip': 'River Tay — Grandtully',
  'Sea Kayak': 'Sea Kayak — Cumbrae circumnavigation',
  'Second Saturday Paddle': 'Second Saturday — Loch Lomond',
  'Skills Sessions / MicroSessions': 'Skills — rolling clinic',
  'Training / Qualifications': 'Training — leader assessment',
};

export const CATEGORY_DEFAULTS: Record<
  string,
  { repeats?: { enabled: boolean; frequency: 'weekly' | 'fortnightly' }; location?: string }
> = {
  'Tuesday Evening - Loch Lomond': {
    repeats: { enabled: true, frequency: 'weekly' },
    location: 'Loch Lomond, Balmaha',
  },
  'Tuesday Evening - All Away': { repeats: { enabled: true, frequency: 'weekly' } },
  Pinkston: { location: 'Pinkston Watersports Centre, Glasgow' },
};

export function gradeOptionsFor(category: Category | null): readonly string[] | null {
  if (!category) {
    return null;
  }
  if (category.name === 'Sea Kayak') {
    return SEA_GRADES;
  }
  if (category.name === 'Pinkston') {
    return PINKSTON_GRADES;
  }
  if (category.name === 'River Trip') {
    return RIVER_GRADES;
  }
  return null;
}

export function groupCategories(categories: Category[]): CategoryGroup[] {
  const groups: Record<string, CategoryGroup> = {};
  const order: string[] = [];

  const place = (key: string, c: Category, chipLabel: string) => {
    if (!groups[key]) {
      groups[key] = { label: key, items: [] };
      order.push(key);
    }
    groups[key].items.push({ category: c, label: chipLabel });
  };

  for (const c of categories) {
    if (c.name === 'Sea Kayak') {
      place('Open water', c, 'Sea Kayak');
    } else if (c.name === 'River Trip') {
      place('Open water', c, 'River');
    } else if (c.name === 'Pinkston') {
      place('Pump track', c, 'Pinkston');
    } else if (c.name.startsWith('Tuesday Evening')) {
      place('Tuesday evening', c, c.name.replace('Tuesday Evening - ', ''));
    } else if (
      c.name === 'Pool / Loch Sessions' ||
      c.name === 'Night Paddle' ||
      c.name === 'Second Saturday Paddle'
    ) {
      place('Loch / pool', c, c.name);
    } else if (c.name.startsWith('Skills') || c.name.startsWith('Training')) {
      place('Skills & training', c, c.name);
    } else {
      place('Other', c, c.name);
    }
  }

  return order.map((k) => groups[k]);
}

export function toLocalIsoMinutes(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function defaultStartIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(18, 30, 0, 0);
  return toLocalIsoMinutes(d);
}

export function durationHoursBetween(startIso: string, endIso: string | null): string {
  if (!endIso) {
    return '';
  }
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!isFinite(ms) || ms <= 0) {
    return '';
  }
  const hours = ms / (1000 * 60 * 60);
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(2);
}

export function formatPreviewDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
