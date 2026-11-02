import { useEffect, useId, useRef } from 'react';
import { IconX } from './icons';

// Built on the native <dialog> opened with showModal() (Royale Design
// System). That puts it in the browser's top layer, above everything on the
// page whatever its z-index -- the sticky top bar (z-30) and the sidebar
// (z-50) used to stay bright above the old z-20 overlay. It also gives, for
// free: focus kept inside the dialog, the page behind made inert (no tabbing
// or clicking into it), and Escape handled per dialog -- only the topmost of
// nested dialogs (an image opened from a PO's detail) gets it.
//
// Escape is turned into onClose() rather than letting the dialog close
// itself, so the parent's state stays the one thing deciding what's open
// (and onClose below catches any close the browser makes on its own).
// A click on the backdrop does not close it, as before: a half-filled form
// is not lost to a stray click.
export function Modal({
  title,
  onClose,
  children,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    // Put focus back on whatever opened the dialog (e.g. "Deleted items")
    // once it closes, instead of dropping keyboard users at the page top.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      opener?.focus();
    };
  }, []);

  return (
    // no-print: a dialog open at print time would otherwise paper over the
    // whole first page. Overview closes its print dialog before handing off to
    // window.print(); this covers any other modal and any timing slip.
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // Backstop: Chrome may close a dialog on a repeated Escape without a
      // cancel event. Without this the dialog would vanish while the parent
      // still thinks it's open, and its button couldn't reopen it. (Our own
      // close() on unmount fires on a detached node, so it doesn't land here.)
      onClose={onClose}
      className="no-print m-auto w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-lg border border-rule-strong bg-surface p-0 text-ink shadow-card backdrop:bg-black/40"
    >
      {/* The card's height is capped to the viewport and split into a fixed
          header + a scrolling body, so a tall modal (a PO with many
          milestones) scrolls its body instead of losing its header. */}
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex shrink-0 items-center justify-between border-b border-rule px-5 py-4 sm:px-6">
          <h2 id={titleId} className="font-display text-lg font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-ink-muted outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 sm:p-6">{children}</div>
      </div>
    </dialog>
  );
}
