// Per-grade narrowing of new-trip alerts. A member subscribed to a category
// can also pick grades within it (profiles.notify_grade_filters, keyed by
// category id). No grades picked means every grade, as before.

export type GradeFilters = Record<string, string[] | undefined> | null | undefined;

// The single grades a grade covers: 'G2/3' → G2, G3; 'P1/2/3' → P1, P2, P3;
// 'G3(4)' → G3. A range trip counts as any of the grades it spans, so someone
// who only wants G3 still hears about a G2/3 trip.
function components(grade: string): string[] {
  const base = grade.replace(/\(.*\)$/, '').trim();
  const m = base.match(/^(.*?)(\d+(?:\/\d+)+)$/);
  if (!m) {
    return [base];
  }
  const [, prefix, nums] = m;
  return nums.split('/').map((n) => `${prefix}${n}`);
}

export function wantsGrade(
  filters: GradeFilters,
  categoryId: number,
  grade: string | null,
): boolean {
  const picked = filters?.[String(categoryId)];
  if (!picked || picked.length === 0) {
    return true;
  }
  // An ungraded trip could be anything — tell them rather than risk them
  // missing the one they were waiting for.
  if (!grade) {
    return true;
  }
  // Only the trip's grade is split: leaving 'G2/3' switched on shouldn't pull
  // in a plain G2 trip the member switched off.
  return picked.includes(grade) || components(grade).some((g) => picked.includes(g));
}
