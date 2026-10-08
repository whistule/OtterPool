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
  | 'priceTiers'
  | 'repeatCount'
  | 'whatsapp';

// A WhatsApp group invite link; same pattern as the event_chat_links check.
export const WHATSAPP_INVITE_RE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+(\?\S*)?$/;

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
  price_options: unknown;
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

// Standard "what to bring" kit lists, offered as presets in the event form; the
// leader loads one and edits it. Pool, loch, sea day and sea weekend are the
// club's own DCKC lists — keep their sections, including the optional ones.
// The rest come from the prototype. Format is parsed by lib/kit-list.ts: one
// item per line, a line ending in ":" is a heading, "Note: ..." is small print.
export type KitTemplate = { key: string; label: string; text: string };

// Club kit every trip can borrow — the heading asks members to tell the leader
// in advance. Pinkston adds a helmet after it.
const BORROW = [
  'Available to borrow (get in touch with the leader so they know what you need to borrow):',
  'Kayak',
  'Paddle',
  'Buoyancy aid',
  'Spray deck',
  'Wetsuit',
  'Cagoule',
];

export const KIT_TEMPLATES: KitTemplate[] = [
  {
    key: 'pool',
    label: 'Pool session',
    text: [
      'Personal:',
      'Swimming attire',
      'T-shirt (worn over swimwear)',
      'Towel',
      'Goggles',
      'Available to borrow:',
      'Club boats',
      'Paddles',
      'Spray decks',
    ].join('\n'),
  },
  {
    key: 'loch',
    label: 'Loch',
    text: [
      'Personal:',
      'Shoes suitable for water',
      'Large towel',
      'Swimwear',
      'Available to borrow:',
      'Wetsuits',
      'Kayaks / boats',
      'Paddles',
      'Spray decks',
      'Buoyancy aids',
    ].join('\n'),
  },
  {
    // DCKC "Check List: Sea Kayak Trip Kit List".
    key: 'sea-day',
    label: 'Sea day trip',
    text: [
      'Essential:',
      'Kayak*',
      'Paddle*',
      'Buoyancy aid*',
      'Spray deck*',
      'Wetsuit* + cagoule*, or drysuit',
      'Warm layer',
      '(For late season & winter) Pogies or palmless mitts [not neoprene gloves]',
      'Wetboots or water shoes with reasonable tread / grip',
      'Lunch / snacks',
      'Drinking water',
      'Hats (sun hat / warm hat)',
      'Sun cream',
      'Small dry bag for car keys',
      'Head-torch',
      'Note: * available to borrow from the club — let the leader know in advance what you need.',
      'Suggested safety kit — develop your own over time:',
      'Whistle',
      'Repair kit',
      'Hand pump',
      'Towline',
      'Optional:',
      'Helmet',
      'Spare paddle (split)',
      'Compass',
      'Knife (recommended; essential if you carry a towline)',
      'Waterproof camera',
      'Watch (waterproof)',
      'Hot drink',
      'Sponge',
      'Midge net',
      'Waterproof jacket / storm cag',
      'Dry bag with a spare change of clothes, towel, footwear',
      'A little spare cash',
    ].join('\n'),
  },
  {
    // DCKC "Weekend Sea Kayak Expedition Equipment List".
    key: 'sea-weekend',
    label: 'Sea weekend expedition',
    text: [
      'For overnight:',
      'Tent + poles & pegs',
      'Sleeping bag (ideally 3/4 season†)',
      'Sleeping mat',
      'Dry bags (particularly for dry clothes and sleeping bag)',
      'Cooking stove + fuel + lighter',
      'Cutlery + cooking utensils',
      'Pot / pan',
      'Mug + plastic plate / bowl',
      'Washing liquid + scrubber / brush',
      'Cooking extras (salt / pepper, cooking oil, etc)',
      'Breakfast / dinner',
      'Tea / coffee / milk / snacks',
      'Torch (head-torch if you have) + spare batteries',
      'Change of clothes for off water',
      'Warm jacket',
      'Waterproof jacket',
      'Trainers / boots for off water',
      'Toiletries / toilet paper / hand sanitiser',
      'Midge net† + repellent†',
      'Thinnish set of gloves†',
      'Warm hat† (for off water)',
      'Water bladder / bottle / container — min 2L per night + water for paddling',
      'Sun cream / sunglasses†',
      'Small personal first aid kit',
      'Personal medical supplies e.g. inhaler / epipen / insulin (tell at least two people in the group where they are)',
      'Bin bag / spare plastic bag',
      'Note: † may be left out or adjusted for weather / season',
      'For kayaking:',
      'Kayak* (check skeg)',
      'Paddle* (+ spare if you have)',
      'Pump',
      'Wetsuit* + cagoule*, or drysuit (+ dry trousers)',
      'Buoyancy aid*',
      'Spray deck*',
      'Warm hat + cap for paddling',
      'Paddling thermals (suit or top / bottom and socks)',
      'Wetboots / kayaking shoes',
      'Pogies / paddling gloves',
      'Water bottle / bladder + flask†',
      'Lunch',
      'Snacks + emergency food',
      'Note: * available to borrow from the club — let the leader know in advance what you need.',
      'Optional:',
      'Phone / waterproof bag',
      'Camera / memory card / batteries',
      'Battery pack',
      'Towline',
      'VHF marine radio',
      'Map / compass / map case (recommended, not essential)',
      'Repair kit',
      'Paddle float',
      'Flares',
      'Trowel for toileting',
      'Penknife / repair tool',
      'Tea towel',
      'Emergency whistle',
      'Foldable seat for carry mat',
      'Group equipment (carried by the leaders):',
      'Spare spray deck',
      'Spare warm clothes',
      'Group first aid kit',
      'Emergency group shelter',
      'Emergency distress beacon',
      'Spare paddles',
      'Spare map / compass',
      'Kayak repair kit',
      'Emergency flares',
      'Optional group equipment (location / group dependent):',
      'Water carrier',
      'Firelighters',
      'Kindling',
      'Coal',
      'Saw / axe',
      'Notes on packing:',
      'Note: Everything must fit through the kayak hatches — use smaller dry bags (<20L) and pack tent poles separately. Pack heavy items (water, food) towards the middle of the boat.',
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
      ...BORROW,
    ].join('\n'),
  },
  {
    key: 'pinkston',
    label: 'Pinkston',
    text: [
      'Kayak',
      'Paddle',
      'Buoyancy aid',
      'Helmet (mandatory on site)',
      'Wetsuit or drysuit',
      'Neoprene boots',
      'Change of clothes + towel',
      'Water bottle',
      ...BORROW,
      'Helmet',
    ].join('\n'),
  },
  {
    key: 'all-away',
    label: 'All away',
    text: [
      'Personal:',
      'Shoes suitable for water',
      'Large towel',
      'Warm layers',
      'Change of clothes',
      'Lunch + snacks + water',
      'Sun cream (summer)',
      'Optional:',
      'Midge net',
      'Dry bag',
      ...BORROW,
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
      ...BORROW,
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
      ...BORROW,
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
  'Sea Kayak': kitText('sea-day'),
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

// Flat colour-dot category picker (matches the create-event prototype). Maps
// each DB category to a short chip label + a discipline dot colour; unknown
// categories fall back to their raw name and the navy dot.
// Distinct dot colours per discipline so every category is tell-apart-able:
// sea = teal, river = bright green, pinkston = orange, pool = slate,
// loch = deep green, skills = navy, training = deep red.
export const CATEGORY_CHIP: Record<string, { label: string; color: string }> = {
  'Sea Kayak': { label: 'Sea Kayak', color: OtterPalette.seaTeal[1] },
  'River Trip': { label: 'River', color: OtterPalette.riverGreen[1] },
  Pinkston: { label: 'Pinkston', color: OtterPalette.pinkstonOrange[0] },
  'Tuesday Evening - Loch Lomond': { label: 'Tue Evening — Loch', color: OtterPalette.forest },
  'Tuesday Evening - All Away': { label: 'Tue Evening — All Away', color: OtterPalette.forest },
  'Night Paddle': { label: 'Night Paddle', color: OtterPalette.lochPool },
  'Pool / Loch Sessions': { label: 'Pool session', color: OtterPalette.lochPool },
  'Second Saturday Paddle': { label: '2nd Saturday', color: OtterPalette.seaTeal[2] },
  'Skills Sessions / MicroSessions': { label: 'MicroSession', color: OtterPalette.slateNavy },
  'Training / Qualifications': { label: 'Training and quals', color: OtterPalette.ice },
};

// Keyword fallbacks so category *variants* (e.g. "Sea Kayak - B Trip",
// "Pinkston - 2 Pumps") still get the right discipline colour/label rather
// than the navy default.
const CATEGORY_KEYWORDS: { match: string; chip: { label: string; color: string } }[] = [
  { match: 'sea kayak', chip: { label: 'Sea Kayak', color: OtterPalette.seaTeal[1] } },
  { match: 'pinkston', chip: { label: 'Pinkston', color: OtterPalette.pinkstonOrange[0] } },
  { match: 'river', chip: { label: 'River', color: OtterPalette.riverGreen[1] } },
  { match: 'loch', chip: { label: 'Loch', color: OtterPalette.forest } },
  { match: 'pool', chip: { label: 'Pool', color: OtterPalette.lochPool } },
  { match: 'skills', chip: { label: 'MicroSession', color: OtterPalette.slateNavy } },
  { match: 'training', chip: { label: 'Training and quals', color: OtterPalette.ice } },
  { match: 'night', chip: { label: 'Night Paddle', color: OtterPalette.lochPool } },
];

export function categoryChip(name: string): { label: string; color: string } {
  const exact = CATEGORY_CHIP[name];
  if (exact) {
    return exact;
  }
  const lower = name.toLowerCase();
  const kw = CATEGORY_KEYWORDS.find((k) => lower.includes(k.match));
  return kw ? kw.chip : { label: name, color: OtterPalette.slateNavy };
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
  if (!Number.isFinite(ms) || ms <= 0) {
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

// Which events in a repeating series an edit applies to.
export type SeriesScope = 'single' | 'following' | 'all';

// How each shared column is named in the "you changed …" prompt. cost and
// price_options both read as "price" so a tier edit isn't listed twice.
export const SHARED_FIELD_LABELS: Record<string, string> = {
  title: 'title',
  category_id: 'category',
  description: 'description',
  what_to_bring: 'what to bring',
  leader_id: 'leader',
  assistant_id: 'assistant',
  grade_advertised: 'grade',
  location: 'location',
  meeting_point: 'meeting point',
  meeting_time: 'meeting time',
  put_in_point: 'put-in point',
  put_in_time: 'put-in time',
  min_level: 'minimum level',
  max_participants: 'max participants',
  cost: 'price',
  price_options: 'price',
  approval_mode: 'approval',
};

// ["price", "photo"] → "price and photo"; three or more get commas.
export function joinLabels(labels: string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? '';
  }
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}
