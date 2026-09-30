// A member's status is worked out, never stored: an admin's override wins,
// otherwise it follows the verified-members list mirrored from MemberMojo.
// Mirrors memberStatus() in apps/mobile/lib/membership.ts — that file's test
// checks the two agree.

export type MemberStatus = 'active' | 'aspirant' | 'lapsed' | 'suspended';
export type ListRow = { expires_on: string | null };

/** Today as 'YYYY-MM-DD', to compare against expires_on. UTC on Deno. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function memberStatus(
  override: MemberStatus | null,
  listed: ListRow | null,
  on: string = today(),
): MemberStatus {
  if (override) {
    return override;
  }
  if (!listed) {
    return 'aspirant';
  }
  return listed.expires_on === null || listed.expires_on >= on ? 'active' : 'lapsed';
}
