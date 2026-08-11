import { Modal } from './Modal';
import { PRINT_SECTIONS, type PrintSectionKey } from '../lib/printSections';

export function PrintOptionsModal({
  excluded,
  onToggle,
  onSelectAll,
  onPrint,
  onClose,
}: {
  excluded: Set<PrintSectionKey>;
  onClose: () => void;
  onPrint: () => void;
  onSelectAll: () => void;
  onToggle: (key: PrintSectionKey) => void;
}) {
  const includedCount = PRINT_SECTIONS.length - excluded.size;

  return (
    <Modal title="Sections to print" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-ink-faint">
          Your choice is remembered for next time. Paper size and orientation are set in the print dialog — landscape
          suits the budget table.
        </p>
        <p className="text-xs text-ink-faint">
          For a cleaner printout, uncheck "Headers and footers" in the print dialog — it's a one-time setting your
          browser remembers, and removes the browser's own URL/timestamp/page-number line (the report already has its
          own date and author line above).
        </p>

        <div className="flex flex-col gap-0.5 border-y border-rule py-2">
          {PRINT_SECTIONS.map((section) => (
            <label
              key={section.key}
              className="flex cursor-pointer items-center gap-2.5 rounded-sm px-1 py-1.5 text-sm text-ink hover:bg-surface-2"
            >
              <input
                type="checkbox"
                checked={!excluded.has(section.key)}
                onChange={() => onToggle(section.key)}
                className="h-4 w-4 rounded border-rule-strong text-accent focus:ring-accent"
              />
              {section.label}
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            className="rounded-sm border border-rule-strong px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={onPrint}
            disabled={includedCount === 0}
            className="rounded-sm bg-accent px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
          >
            Print {includedCount} section{includedCount === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
