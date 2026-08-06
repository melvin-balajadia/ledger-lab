// parent_id is only populated on ~40% of planning_lines rows (a pre-existing
// ETL gap) -- sorting/grouping by the code's own segments is reliable where
// parent_id isn't, and needs no schema fix to work correctly.
export function compareCodes(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
