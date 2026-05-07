/** Progression levels in rank order — index = strength. */
export const LEVELS = ['frog', 'duck', 'otter', 'dolphin', 'selkie'] as const;
export type Level = (typeof LEVELS)[number];

/** True if memberLevel >= requiredLevel. */
export function meetsLevel(memberLevel: string, requiredLevel: string): boolean {
  return LEVELS.indexOf(memberLevel as Level) >= LEVELS.indexOf(requiredLevel as Level);
}

/** Grade ladders, low → high. Mirrors app/lib/progress.ts. */
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

export type Track = 'sea' | 'river' | 'pinkston';

/** Map an event_categories.name to the track its ceiling applies to. */
export function trackForCategory(name: string | null | undefined): Track | null {
  if (!name) {
    return null;
  }
  if (name.startsWith('Sea Kayak')) {
    return 'sea';
  }
  if (name === 'River Trip') {
    return 'river';
  }
  if (name.startsWith('Pinkston')) {
    return 'pinkston';
  }
  return null;
}

function gradesFor(track: Track): readonly string[] {
  return track === 'sea' ? SEA_GRADES : track === 'river' ? RIVER_GRADES : PINKSTON_GRADES;
}

/** True if `grade` is at or below `ceiling` on the given track. Unknown grade → false (require review). */
export function gradeWithinCeiling(track: Track, ceiling: string, grade: string): boolean {
  const list = gradesFor(track);
  const c = list.indexOf(ceiling);
  const g = list.indexOf(grade);
  if (c === -1 || g === -1) {
    return false;
  }
  return c >= g;
}
