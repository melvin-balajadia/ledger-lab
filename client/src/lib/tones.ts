export type Tone = 'warn' | 'danger' | 'success' | 'info';

// Shared color mapping so StatusPill (table badges) and the alerts feed's
// icon circles read as the same severity language, even though their shapes differ.
export const toneClasses: Record<Tone, { bg: string; text: string }> = {
  warn: { bg: 'bg-warn-soft', text: 'text-warn' },
  danger: { bg: 'bg-danger-soft', text: 'text-danger' },
  success: { bg: 'bg-success-soft', text: 'text-success' },
  info: { bg: 'bg-accent-soft', text: 'text-accent' },
};
