import { useEffect, useRef, useState } from 'react';
import { IconChevronDown } from './icons';

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

// One control for the signed-in user instead of a name, an avatar and a
// Log out link side by side: the initials (and name, on wide screens) open a
// small menu with who is signed in and Log out. Closes on a click outside,
// on Escape, and after choosing. z-20: the Royale z-scale's header dropdown.
export function AccountMenu({ name, username, onLogout }: { name: string; onLogout: () => void; username: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${name}`}
        className="flex items-center gap-2 rounded-sm py-1 pr-1.5 pl-1 outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
          {initials(name)}
        </span>
        <span className="hidden max-w-40 truncate text-[13px] font-medium text-ink md:block">{name}</span>
        <IconChevronDown className="h-3.5 w-3.5 text-ink-muted" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-20 mt-1.5 w-60 rounded-md border border-rule bg-surface p-1 shadow-card"
        >
          <div className="border-b border-rule px-3 pt-2 pb-2.5">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            <p className="truncate text-xs text-ink-muted">Signed in as {username}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="mt-1 w-full rounded-sm px-3 py-2 text-left text-sm text-ink outline-none hover:bg-surface-2 hover:text-danger focus-visible:bg-surface-2"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
