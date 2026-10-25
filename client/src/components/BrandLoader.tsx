import { useEffect, useState } from 'react';

// Branded loading indicator for the gap a content skeleton can't cover --
// no known page shape to mimic yet, because we're still resolving who's
// signed in. Reuses the bar-glyph mark from the favicon rather than a
// generic spinner, animated as a staggered equalizer pulse (index.css's
// ledgerlab-loader-bar keyframes).

// Render nothing for the first quarter second. The session check this covers
// runs against a server on the same machine and resolves in ~3.5ms (measured;
// ~209ms on the first call of the day, while the connection pool warms), so
// showing the loader immediately meant a full-screen flash of branding on
// essentially every load -- worse than showing nothing at all.
//
// Deliberately a delay, NOT a minimum display time: padding a 4ms wait out to
// half a second to make the flash look intentional just makes the app slower
// on purpose. Past this threshold the wait is real (a restarting server, a
// cold pool) and the feedback is worth having.
const SHOW_AFTER_MS = 250;

function Bars() {
  const bar = (color: string, delayMs: number) => (
    <span
      className={`h-6 w-1.5 rounded-[1px] ${color}`}
      style={{
        animation: 'ledgerlab-loader-bar 1s ease-in-out infinite',
        animationDelay: `${delayMs}ms`,
        transformOrigin: 'bottom',
      }}
    />
  );
  return (
    <span className="flex items-end gap-1" aria-hidden="true">
      {bar('bg-accent', 0)}
      {bar('bg-accent-strong', 150)}
      {bar('bg-accent', 300)}
    </span>
  );
}

// Fills the gap left by ProtectedRoute while it's still resolving whether
// there's a session at all -- previously a blank white screen for however
// long that check takes.
export function BrandLoader({ label = 'Loading' }: { label?: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  // Blank rather than a spinner: for the sub-10ms case this is the whole
  // point, and the caller is already rendering nothing else.
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas"
    >
      <Bars />
      <span className="font-display text-sm font-medium text-ink-faint">LedgerLab</span>
      <span className="sr-only">{label}…</span>
    </div>
  );
}
