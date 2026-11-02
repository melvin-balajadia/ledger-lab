import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { buttonClass } from './buttonStyles';
import { IconChevronLeft } from './icons';

// The Royale Design System's PageHeader: the title bar every page opens with.
// An icon badge (the page's own menu icon), the title, an optional subtitle
// that identifies this record (a period, a position -- never help text, and
// hidden on phones), status badges beside the title, then the actions and,
// on detail pages, the way back. Index pages take no back link.
export function PageHeader({
  icon,
  title,
  subtitle,
  badges,
  actions,
  back,
}: {
  actions?: ReactNode;
  back?: { label: string; to: string };
  badges?: ReactNode;
  icon: ReactNode;
  subtitle?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-rule bg-surface px-4 py-3.5 shadow-card sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-accent">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base leading-tight font-semibold text-ink sm:text-lg">{title}</h2>
            {badges}
          </div>
          {subtitle && <p className="mt-0.5 hidden text-xs text-ink-muted sm:block">{subtitle}</p>}
        </div>
      </div>
      {(actions || back) && (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {actions}
          {back && (
            <Link to={back.to} className={buttonClass('secondary', 'sm')}>
              <IconChevronLeft className="h-3.5 w-3.5" />
              {back.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
