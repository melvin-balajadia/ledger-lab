import { useEffect, useRef } from 'react';
import { IconX } from './icons';

// Tracks which Modal is topmost when they're nested (e.g. an image lightbox
// opened from within a detail modal), so Escape closes only that one instead
// of every mounted Modal's listener firing on the same keydown.
let modalStack: symbol[] = [];

export function Modal({
  title,
  onClose,
  children,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  const idRef = useRef(Symbol());

  useEffect(() => {
    const id = idRef.current;
    modalStack.push(id);
    return () => {
      modalStack = modalStack.filter((entry) => entry !== id);
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && modalStack[modalStack.length - 1] === idRef.current) {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center sm:p-6">
      {/* The card's own height is capped to the viewport (minus the backdrop
          padding) and split into a fixed header + a scrolling body -- before
          this, a tall modal (e.g. a PO with many milestones) grew past the
          viewport and relied on the backdrop's own scroll to reach it, which
          combined with items-center clips/loses the header rather than
          reliably scrolling back to it. */}
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col rounded-lg border border-rule-strong bg-surface shadow-card sm:max-h-[calc(100vh-3rem)]">
        <div className="flex shrink-0 items-center justify-between border-b border-rule px-5 py-4 sm:px-6">
          <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
