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
  | 'endsAt'
  | 'meetingTime'
  | 'putInTime'
  | 'maxParticipants'
  | 'cost'
  | 'repeatCount';

export type Status = 'open' | 'full' | 'closed' | 'cancelled';

export type LoadedEvent = {
  id: string;
  title: string;
  category_id: number;
  description: string | null;
  what_to_bring: string | null;
  grade_advertised: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  meeting_point: string | null;
  meeting_time: string | null;
  put_in_point: string | null;
  put_in_time: string | null;
  min_level: 'frog' | 'duck' | 'otter' | 'dolphin' | 'selkie';
  max_participants: number | null;
  cost: number;
  approval_mode: 'auto' | 'manual_all';
  status: 'draft' | Status;
  leader_id: string;
  assistant_id: string | null;
  photo_path: string | null;
  series_id: string | null;
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
    location: 'Loch Lomond, Balmaha',
  },
  Pinkston: { location: 'Pinkston Watersports Centre, Glasgow' },
};

// Standard "what to bring" kit lists, coded in from the DCKC kit templates in
// the prototype (docs/otter-pool-create-event.html). Offered as a drop-down in
// the event form so a leader can load a preset and then edit it. One item per
// line; a line ending in ":" renders as a sub-heading, others as bullets.
export type KitTemplate = { key: string; label: string; text: string };

export const KIT_TEMPLATES: KitTemplate[] = [
  {
    key: 'pool',
    label: 'Pool session',
    text: [
      'Swimming attire',
      'T-shirt (worn over swimwear)',
      'Towel',
      'Goggles',
      'Club boats, paddles & spray decks available to borrow',
    ].join('\n'),
  },
  {
    key: 'loch',
    label: 'Loch',
    text: [
      'Kayak + paddle',
      'Buoyancy aid',
      'Warm layers',
      'Waterproof jacket',
      'Snacks + water',
      'Change of clothes',
    ].join('\n'),
  },
  {
    key: 'sea-day-summer',
    label: 'Sea day — summer',
    text: [
      'Sea kayak + paddle',
      'Spare paddle',
      'Buoyancy aid',
      'Wetsuit or drysuit',
      'Helmet',
      'VHF radio (waterproof)',
      'Compass',
      'Lunch + snacks + water',
      'First aid kit',
      'Tow line',
      'Pump + sponge',
      'Spare warm layer',
      'Waterproof jacket',
      'Sunscreen',
      'Whistle',
    ].join('\n'),
  },
  {
    key: 'sea-day-winter',
    label: 'Sea day — winter',
    text: [
      'Sea kayak + paddle',
      'Spare paddle',
      'Buoyancy aid',
      'Drysuit (essential)',
      'Thermal underlayers',
      'Neoprene gloves + boots',
      'Balaclava',
      'Helmet',
      'VHF radio (waterproof)',
      'Compass',
      'Hot flask + food + snacks',
      'First aid kit',
      'Tow line',
      'Pump + sponge',
      'Spare warm layers (dry bag)',
      'Head torch (early dark)',
      'Whistle',
      'Emergency bivvy',
    ].join('\n'),
  },
  {
    key: 'sea-overnight',
    label: 'Sea overnight (1 night)',
    text: [
      'Sea kayak + paddle',
      'Spare paddle',
      'Buoyancy aid',
      'Drysuit or wetsuit',
      'Thermal underlayers',
      'Helmet',
      'VHF radio (waterproof)',
      'Flares (in date)',
      'Compass',
      'Bivvy or tent',
      'Sleeping bag (in dry bag)',
      'Sleeping mat',
      'Stove + fuel',
      '2 days food',
      'Water',
      'First aid kit',
      'Tow line',
      'Pump + sponge',
      'Spare clothing (dry bags)',
      'Head torch',
      'Whistle',
    ].join('\n'),
  },
  {
    key: 'sea-expedition',
    label: 'Sea expedition (2+ nights)',
    text: [
      'Sea kayak + paddle',
      'Spare paddle',
      'Buoyancy aid',
      'Drysuit',
      'Thermal underlayers',
      'Neoprene gloves + boots',
      'Helmet',
      'VHF radio (waterproof, charged)',
      'Flares (in date)',
      'Compass + chart',
      'Bivvy or tent',
      'Sleeping bag (in dry bag)',
      'Sleeping mat',
      'Stove + fuel + lighter',
      '3 days food + emergency rations',
      'Water + purification',
      'First aid kit',
      'Tow line',
      'Pump + sponge',
      'Navigation lights',
      'Spare clothing (dry bags)',
      'Sunscreen + lip balm',
      'Head torch + spare batteries',
      'Whistle',
      'Personal locator beacon',
    ].join('\n'),
  },
  {
    key: 'river',
    label: 'River',
    text: [
      'Kayak + paddle',
      'Buoyancy aid',
      'Helmet (mandatory)',
      'Wetsuit or drysuit',
      'Neoprene boots',
      'Throw line',
      'First aid kit',
      'Lunch + snacks + water',
      'Spare warm layer (dry bag)',
      'Change of clothes for after',
      'Carabiner + sling',
      'Whistle',
    ].join('\n'),
  },
  {
    key: 'pinkston',
    label: 'Pinkston',
    text: [
      'Kayak (hire available on site)',
      'Paddle',
      'Buoyancy aid',
      'Helmet (mandatory on site)',
      'Wetsuit or drysuit',
      'Neoprene boots',
      'Change of clothes + towel',
      'Water bottle',
    ].join('\n'),
  },
  {
    key: 'all-away',
    label: 'All away',
    text: [
      'Kayak + paddle',
      'Buoyancy aid',
      'Helmet (if paddling moving water)',
      'Warm layers',
      'Waterproof jacket',
      'Lunch + snacks + water',
      'Change of clothes',
      'Sun cream (summer)',
    ].join('\n'),
  },
  {
    key: 'skills',
    label: 'Skills',
    text: [
      'Kayak + paddle',
      'Buoyancy aid',
      'Warm layers',
      'Waterproof jacket',
      'Water bottle',
      'Change of clothes + towel',
    ].join('\n'),
  },
  {
    key: 'second-saturday',
    label: 'Second Saturday',
    text: [
      'Sea kayak + paddle',
      'Buoyancy aid',
      'Warm layers',
      'Waterproof jacket',
      'Lunch + snacks + water',
      'Compass',
      'Change of clothes',
    ].join('\n'),
  },
];

const kitText = (key: string): string => KIT_TEMPLATES.find((t) => t.key === key)?.text ?? '';

// Which preset pre-fills on create for a given category (before the leader
// picks a different one or edits the field).
export const CATEGORY_EQUIPMENT: Record<string, string> = {
  'Pool / Loch Sessions': kitText('pool'),
  'Tuesday Evening - Loch Lomond': kitText('loch'),
  'Tuesday Evening - All Away': kitText('all-away'),
  'Sea Kayak': kitText('sea-day-summer'),
  'River Trip': kitText('river'),
  Pinkston: kitText('pinkston'),
  'Second Saturday Paddle': kitText('second-saturday'),
  'Skills Sessions / MicroSessions': kitText('skills'),
};

// Display a member as first name + surname initial, e.g. "John Smith" -> "John S".
// Prefers full_name (has first/last); falls back to display_name.
export function abbreviateName(fullName: string | null, displayName: string | null): string {
  const source = (fullName ?? displayName ?? '').trim();
  if (!source) {
    return 'Member';
  }
  const parts = source.split(/\s+/);
  if (parts.length < 2) {
    return source;
  }
  const initial = parts[parts.length - 1][0]?.toUpperCase() ?? '';
  return initial ? `${parts[0]} ${initial}` : parts[0];
}

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
