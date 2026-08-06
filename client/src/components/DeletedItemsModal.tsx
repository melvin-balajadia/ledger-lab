import { useState } from 'react';
import { Modal } from './Modal';

// Shared shape for the "Deleted items" panel across replenishments, payroll
// entries, and purchase orders -- a voided row disappears from every list
// and total exactly like removing a spreadsheet row, but stays here,
// restorable, until she says otherwise.
//
// Pending/error state is tracked per-row IN HERE, not by the caller's
// mutation object -- a single useMutation instance is shared across every
// row in the list, so deriving "is this row restoring" from its shared
// isPending/variables breaks the moment two different rows are restored in
// quick succession (the second click's variables overwrite the first's).
export function DeletedItemsModal<T extends { id: number }>({
  title,
  items,
  isLoading,
  onRestore,
  renderRow,
  onClose,
}: {
  title: string;
  items: T[] | undefined;
  isLoading: boolean;
  onRestore: (id: number) => Promise<unknown>;
  renderRow: (item: T) => React.ReactNode;
  onClose: () => void;
}) {
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Map<number, string>>(new Map());

  async function handleRestore(id: number) {
    setRestoringId(id);
    setErrors((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    try {
      await onRestore(id);
    } catch (err) {
      setErrors((prev) => new Map(prev).set(id, err instanceof Error ? err.message : 'Restore failed'));
    } finally {
      setRestoringId((current) => (current === id ? null : current));
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      {isLoading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : !items || items.length === 0 ? (
        <p className="text-sm text-ink-faint">Nothing deleted.</p>
      ) : (
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col gap-1 border-b border-rule pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 text-sm text-ink">{renderRow(item)}</div>
                <button
                  type="button"
                  onClick={() => handleRestore(item.id)}
                  disabled={restoringId === item.id}
                  className="shrink-0 text-sm font-medium text-accent hover:underline disabled:opacity-60"
                >
                  {restoringId === item.id ? 'Restoring…' : 'Restore'}
                </button>
              </div>
              {errors.has(item.id) && <p className="text-xs text-danger">{errors.get(item.id)}</p>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
