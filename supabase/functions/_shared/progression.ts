/** Progression levels in rank order — index = strength. */
export const LEVELS = ["frog", "duck", "otter", "dolphin", "selkie"] as const;
export type Level = (typeof LEVELS)[number];

/** True if memberLevel >= requiredLevel. */
export function meetsLevel(memberLevel: string, requiredLevel: string): boolean {
  return LEVELS.indexOf(memberLevel as Level) >= LEVELS.indexOf(requiredLevel as Level);
}
