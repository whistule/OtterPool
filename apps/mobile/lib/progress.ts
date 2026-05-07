import { OtterPalette } from '@/constants/theme';

export type ProgressionLevel = 'frog' | 'duck' | 'otter' | 'dolphin' | 'selkie';
export type Track = 'sea' | 'river' | 'pinkston';

export const LEVEL_ORDER: ProgressionLevel[] = ['frog', 'duck', 'otter', 'dolphin', 'selkie'];

export const LEVEL_EMOJI: Record<ProgressionLevel, string> = {
  frog: '🐸',
  duck: '🦆',
  otter: '🦦',
  dolphin: '🐬',
  selkie: '🦭',
};

export const LEVEL_RANK: Record<ProgressionLevel, number> = {
  frog: 1,
  duck: 2,
  otter: 3,
  dolphin: 4,
  selkie: 5,
};

export const LEVEL_LABEL: Record<ProgressionLevel, string> = {
  frog: 'Frog',
  duck: 'Duck',
  otter: 'Otter',
  dolphin: 'Dolphin',
  selkie: 'Selkie',
};

export const LEVEL_DESC: Record<ProgressionLevel, string> = {
  frog: 'New to kayaking',
  duck: 'Capsize drill complete',
  otter: 'Reliable on-water rescue',
  dolphin: 'Accomplished paddler',
  selkie: 'BC-qualified leader',
};

export const SEA_GRADES = ['Sea A', 'Sea B', 'Sea C'] as const;

export const RIVER_GRADES = [
  'G1',
  'G1/2',
  'G2',
  'G2/3',
  'G3',
  'G3(4)',
  'G4',
  'G4(5)',
  'G4/5',
  'G5',
] as const;

export const PINKSTON_GRADES = ['P1', 'P2', 'P3'] as const;

export const TRACK_LABEL: Record<Track, string> = {
  sea: 'Sea',
  river: 'River',
  pinkston: 'Pinkston',
};

export const TRACK_GRADES: Record<Track, readonly string[]> = {
  sea: SEA_GRADES,
  river: RIVER_GRADES,
  pinkston: PINKSTON_GRADES,
};

export function colorForGrade(grade: string): string {
  if (grade === 'Sea A') {
    return OtterPalette.seaTeal[0];
  }
  if (grade === 'Sea B') {
    return OtterPalette.seaTeal[1];
  }
  if (grade === 'Sea C') {
    return OtterPalette.seaTeal[2];
  }
  if (grade === 'P1') {
    return OtterPalette.pinkstonOrange[0];
  }
  if (grade === 'P2') {
    return OtterPalette.pinkstonOrange[1];
  }
  if (grade === 'P3') {
    return OtterPalette.pinkstonOrange[2];
  }
  if (grade.startsWith('G')) {
    if (grade === 'G1' || grade === 'G1/2' || grade === 'G2') {
      return OtterPalette.riverGreen[0];
    }
    if (grade === 'G2/3' || grade === 'G3' || grade === 'G3(4)') {
      return OtterPalette.riverGreen[1];
    }
    return OtterPalette.riverGreen[2];
  }
  return OtterPalette.lochPool;
}

export function tallyTotals(rows: { bucket: string; count: number }[]): {
  trips: number;
  sea: number;
  river: number;
  pinkston: number;
} {
  let sea = 0;
  let river = 0;
  let pinkston = 0;
  for (const r of rows) {
    if (SEA_GRADES.includes(r.bucket as (typeof SEA_GRADES)[number])) {
      sea += r.count;
    } else if (RIVER_GRADES.includes(r.bucket as (typeof RIVER_GRADES)[number])) {
      river += r.count;
    } else if (PINKSTON_GRADES.includes(r.bucket as (typeof PINKSTON_GRADES)[number])) {
      pinkston += r.count;
    }
  }
  return { trips: sea + river + pinkston, sea, river, pinkston };
}

export function tenureYears(createdAt: string | null | undefined): number {
  if (!createdAt) {
    return 0;
  }
  const start = new Date(createdAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - start) / (365.25 * 24 * 3600 * 1000)));
}

export function memberSinceLabel(createdAt: string | null | undefined): string {
  if (!createdAt) {
    return 'New member';
  }
  const year = new Date(createdAt).getFullYear();
  const yrs = tenureYears(createdAt);
  if (yrs === 0) {
    return `Member since ${year}`;
  }
  return `Member since ${year} · ${yrs} ${yrs === 1 ? 'year' : 'years'}`;
}
