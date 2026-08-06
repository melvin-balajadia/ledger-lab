import { StatusPill } from './StatusPill';
import type { Tone } from '../lib/tones';
import type { ReconciliationStatus } from '../types';

const LABEL: Record<ReconciliationStatus, string> = {
  ok: 'OK',
  review: 'Needs review',
  no_control: 'No control total',
  no_entries: 'No worker entries',
};

// review is a genuine mismatch needing a decision (danger); no_control/no_entries
// are informational data-shape facts, not errors (info); ok is normal (success).
const TONE: Record<ReconciliationStatus, Tone> = {
  ok: 'success',
  review: 'danger',
  no_control: 'info',
  no_entries: 'info',
};

export function ReconciliationBadge({ status }: { status: ReconciliationStatus }) {
  return <StatusPill tone={TONE[status]}>{LABEL[status]}</StatusPill>;
}
