// Which Overview sections go on the printout. She prints the same report each
// cycle, so the choice is remembered rather than re-ticked every time.
export const PRINT_SECTIONS = [
  { key: 'kpis', label: 'Budget / committed / paid summary' },
  { key: 'vat', label: 'VAT summary' },
  { key: 'trend', label: 'Cost trend + breakdown charts' },
  { key: 'burn', label: 'Weekly burn rate' },
  { key: 'budget', label: 'Budget vs. actual table' },
  { key: 'retention', label: 'Retention held' },
  { key: 'suppliers', label: 'Top suppliers by spend' },
  { key: 'alerts', label: 'Alerts & anomalies' },
] as const;

export type PrintSectionKey = (typeof PRINT_SECTIONS)[number]['key'];

const STORAGE_KEY = 'ledgerlab.overview.printExcluded';

// Stores what to EXCLUDE, not what to include. If a section is added to the
// Overview later, a stored include-list wouldn't mention it and it would
// silently vanish from her printouts; an exclude-list defaults it to visible.
export function loadExcluded(): Set<PrintSectionKey> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const valid = new Set(PRINT_SECTIONS.map((s) => s.key as string));
    return new Set(parsed.filter((k): k is PrintSectionKey => typeof k === 'string' && valid.has(k)));
  } catch {
    // Corrupt or unavailable storage (private mode, quota) must not break the
    // page -- fall back to printing everything.
    return new Set();
  }
}

export function saveExcluded(excluded: Set<PrintSectionKey>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...excluded]));
  } catch {
    // Non-fatal: the selection just won't persist to the next session.
  }
}
