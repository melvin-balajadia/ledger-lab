// The Royale Design System's Button styles: primary for the one main action
// of a view, secondary for everything else, sm inside PageHeader. `outline`
// is LedgerLab's own: a quiet button that turns danger on hover, for deletes.
// In their own file (not Button.tsx) so a <Link> can share them -- a
// component file that also exports a function breaks fast refresh.
export type ButtonVariant = 'primary' | 'secondary' | 'outline';
export type ButtonSize = 'sm' | 'md';

// [&_svg]: an icon inside a button is 14px (Royale), whoever passes it.
const base =
  'inline-flex items-center gap-2 rounded-sm font-medium disabled:opacity-60 [&_svg]:size-3.5 [&_svg]:shrink-0';
const sizes: Record<ButtonSize, string> = {
  md: 'px-4 py-2 text-sm',
  sm: 'px-3 py-1.5 text-sm',
};
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent shadow-card hover:bg-accent-strong',
  secondary: 'border border-rule-strong bg-surface text-ink hover:bg-surface-2',
  outline: 'border border-rule-strong bg-surface text-ink-muted hover:border-danger hover:text-danger',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md') {
  return `${base} ${sizes[size]} ${variants[variant]}`;
}
