// Parsing for the membership-verification import screen.
//
// The membership admin exports the current members from MemberMojo and pastes
// them in. That export is a full CSV with many columns, quoted fields that
// contain commas and newlines, and (crucially) several date columns — so we
// can't just grab "the first date" (that's Date of birth). We read the header
// row and pull the Email, "Expires on" and "Membership state" columns by name,
// keeping only rows whose state is Active (paid up). A simpler two-column paste
// (email + date, tab- or comma-separated, no header) still works as a fallback.
//
// Output is a clean [{ email, expires }] array for `import_verified_members`,
// dates normalised to ISO 'YYYY-MM-DD' (expires null when none was parseable).

export type ParsedMemberRow = { email: string; expires: string | null };

export type ParseResult = {
  rows: ParsedMemberRow[];
  withDate: number; // rows that carried a parseable expiry
  noDate: number; // rows with an email but no usable date
  skippedInactive: number; // export rows dropped because state wasn't Active
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
  const isoM = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (isoM) {
    return iso(Number(isoM[1]), Number(isoM[2]), Number(isoM[3]));
  }
  const ukM = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(s);
  if (ukM) {
    return iso(Number(ukM[3]), Number(ukM[2]), Number(ukM[1]));
  }
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
      const [a, b] = nums;
      return iso(Math.max(a, b), month, Math.min(a, b));
    }
  }
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A minimal RFC-4180-ish CSV tokeniser: handles quoted fields, commas and
 * newlines inside quotes, and "" escapes. Returns rows of raw string fields.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let sawContent = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      sawContent = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
      sawContent = true;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') {
        i++;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      sawContent = false;
    } else {
      field += c;
      sawContent = true;
    }
  }
  if (sawContent || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function dedupe(pairs: ParsedMemberRow[], skippedInactive: number): ParseResult {
  const byEmail = new Map<string, string | null>();
  for (const { email, expires } of pairs) {
    const existing = byEmail.get(email);
    // Keep the furthest expiry when an email appears more than once.
    if (existing === undefined || (expires && (!existing || expires > existing))) {
      byEmail.set(email, expires);
    }
  }
  const rows: ParsedMemberRow[] = [];
  let noDate = 0;
  for (const [email, expires] of byEmail) {
    rows.push({ email, expires });
    if (!expires) {
      noDate += 1;
    }
  }
  return { rows, withDate: rows.length - noDate, noDate, skippedInactive };
}

/** Header-driven path: a real MemberMojo CSV export with named columns. */
function fromExport(
  table: string[][],
  emailIdx: number,
  expiresIdx: number,
  stateIdx: number,
): ParseResult {
  const pairs: ParsedMemberRow[] = [];
  let skippedInactive = 0;
  for (const cells of table) {
    const email = (cells[emailIdx] ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      continue;
    }
    // Only paid-up members. A blank state is treated as active (some exports
    // omit it); anything else present must read "active".
    if (stateIdx !== -1) {
      const state = (cells[stateIdx] ?? '').trim().toLowerCase();
      if (state && state !== 'active') {
        skippedInactive += 1;
        continue;
      }
    }
    const expires = expiresIdx !== -1 ? parseMemberDate(cells[expiresIdx] ?? '') : null;
    pairs.push({ email, expires });
  }
  return dedupe(pairs, skippedInactive);
}

/** Fallback: a headerless paste of email + optional date per line. */
function fromLoose(text: string): ParseResult {
  const pairs: ParsedMemberRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const tokens = (/[\t,]/.test(trimmed) ? trimmed.split(/[\t,]+/) : trimmed.split(/\s+/))
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
    pairs.push({ email, expires });
  }
  return dedupe(pairs, 0);
}

/**
 * Parse a paste into clean, de-duped rows. Detects a MemberMojo CSV export by
 * its "Email" header column and reads Email / "Expires on" / "Membership
 * state" by name (Active rows only); otherwise falls back to a simple
 * email(+date) per line.
 */
export function parseMemberPaste(text: string): ParseResult {
  if (!text.trim()) {
    return { rows: [], withDate: 0, noDate: 0, skippedInactive: 0 };
  }
  const table = parseCsv(text);
  const header = (table[0] ?? []).map((c) => c.trim().toLowerCase());
  const emailIdx = header.indexOf('email');
  if (emailIdx !== -1) {
    return fromExport(
      table.slice(1),
      emailIdx,
      header.indexOf('expires on'),
      header.indexOf('membership state'),
    );
  }
  return fromLoose(text);
}
