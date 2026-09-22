// Parsing for the membership-verification import screen.
//
// The membership admin copies two columns out of MemberMojo — email and the
// member's renewal/expiry date — and pastes them in. MemberMojo copies as
// tab-separated columns, but people also paste commas or stray spacing, and
// dates come in UK order (30/09/2027) or ISO. This turns that mess into a
// clean [{ email, expires }] array for `import_verified_members`, with dates
// normalised to ISO 'YYYY-MM-DD' (expires is null when no date was parseable).

export type ParsedMemberRow = { email: string; expires: string | null };

export type ParseResult = {
  rows: ParsedMemberRow[];
  withDate: number; // rows that carried a parseable expiry
  noDate: number; // rows with an email but no usable date
};

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const full = year < 100 ? 2000 + year : year;
  // Round-trip through Date to reject impossible days (e.g. 31 Feb).
  const d = new Date(Date.UTC(full, month - 1, day));
  if (d.getUTCFullYear() !== full || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return `${full}-${pad(month)}-${pad(day)}`;
}

/**
 * Parse a single date token. Accepts ISO (2027-09-30), UK numeric
 * (30/09/2027, 30-9-27, 30.09.2027) and spelled months (30 Sep 2027,
 * "30 September 2027"). Returns ISO 'YYYY-MM-DD' or null.
 */
export function parseMemberDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) {
    return null;
  }
  // ISO first — unambiguous.
  const isoM = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (isoM) {
    return iso(Number(isoM[1]), Number(isoM[2]), Number(isoM[3]));
  }
  // UK numeric: day first.
  const ukM = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(s);
  if (ukM) {
    return iso(Number(ukM[3]), Number(ukM[2]), Number(ukM[1]));
  }
  // Spelled month: "30 Sep 2027" / "30 September 2027" / "Sep 30 2027".
  const words = s.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 3) {
    const nums = words.filter((w) => /^\d+$/.test(w)).map(Number);
    const monWord = words.find(
      (w) => MONTHS[w.slice(0, 4).toLowerCase()] || MONTHS[w.slice(0, 3).toLowerCase()],
    );
    const month = monWord
      ? (MONTHS[monWord.slice(0, 4).toLowerCase()] ?? MONTHS[monWord.slice(0, 3).toLowerCase()])
      : undefined;
    if (month && nums.length === 2) {
      // Bigger number is the year; the other is the day.
      const [a, b] = nums;
      const year = Math.max(a, b);
      const day = Math.min(a, b);
      return iso(year, month, day);
    }
  }
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse a full paste into clean rows. Each non-blank line is split on
 * tabs/commas (or whitespace as a fallback); the email is the token that looks
 * like one, the expiry is the first other token that parses as a date. Lines
 * with no email are dropped; emails are lowercased and de-duped (keeping the
 * furthest expiry).
 */
export function parseMemberPaste(text: string): ParseResult {
  const byEmail = new Map<string, string | null>();
  let noDate = 0;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const tokens = (/[\t,]/.test(trimmed) ? trimmed.split(/[\t,]+/) : trimmed.split(/\s{2,}|\s/))
      .map((t) => t.trim())
      .filter(Boolean);

    const email = tokens.find((t) => EMAIL_RE.test(t))?.toLowerCase();
    if (!email) {
      continue;
    }
    let expires: string | null = null;
    for (const t of tokens) {
      if (t.toLowerCase() === email) {
        continue;
      }
      const d = parseMemberDate(t);
      if (d) {
        expires = d;
        break;
      }
    }
    // Keep the furthest expiry if the same email appears twice.
    const existing = byEmail.get(email);
    if (existing === undefined) {
      byEmail.set(email, expires);
    } else if (expires && (!existing || expires > existing)) {
      byEmail.set(email, expires);
    }
  }

  const rows: ParsedMemberRow[] = [];
  for (const [email, expires] of byEmail) {
    rows.push({ email, expires });
    if (!expires) {
      noDate += 1;
    }
  }
  return { rows, withDate: rows.length - noDate, noDate };
}
