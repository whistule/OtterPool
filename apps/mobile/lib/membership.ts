// A member's status is worked out, never stored: an admin's override wins,
// otherwise it follows the verified-members list mirrored from MemberMojo.
// Mirrored in supabase/functions/_shared/membership.ts for the sign-up gate —
// membership.test.ts checks the two agree.
import type { MemberStatus } from './status';

export type ListRow = { expires_on: string | null };

/** Today as 'YYYY-MM-DD' in local time, to compare against expires_on. */
export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

/** verified_members is keyed on lower(trim(email)). */
export function emailKey(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}
