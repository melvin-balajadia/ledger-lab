import type { ButtonHTMLAttributes } from 'react';

type Variant = 'outline' | 'primary';

const base = 'inline-flex items-center gap-2 rounded-sm px-4 py-2 text-sm font-medium disabled:opacity-60';
const variants: Record<Variant, string> = {
  primary: `${base} bg-accent text-white shadow-card hover:bg-accent-strong`,
  outline: `${base} border border-rule-strong bg-surface text-ink-muted hover:border-danger hover:text-danger`,
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: { variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`${variants[variant]} ${className}`} />;
}
