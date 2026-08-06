import { useState } from 'react';
import { useCreateSupplier, useSuppliers, useUpdateSupplier } from '../hooks/useSuppliers';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { Supplier } from '../types';

export function SupplierForm({ supplier, onClose }: { onClose: () => void; supplier?: Supplier }) {
  const isEdit = Boolean(supplier);
  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier();
  const mutation = isEdit ? updateMutation : createMutation;

  const [name, setName] = useState(supplier?.name ?? '');
  const [tin, setTin] = useState(supplier?.tin ?? '');
  const [isActive, setIsActive] = useState(Boolean(supplier?.is_active ?? true));

  const debouncedName = useDebouncedValue(name, 300);
  const { data: similar = [] } = useSuppliers(debouncedName.trim().length >= 3 ? debouncedName : '');
  const similarOthers = similar.filter((s) => s.id !== supplier?.id && s.name.toLowerCase() !== name.trim().toLowerCase());

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (isEdit && supplier) {
      await updateMutation.mutateAsync({
        id: supplier.id,
        name,
        tin: tin || null,
        is_active: isActive ? 1 : 0,
      });
    } else {
      await createMutation.mutateAsync({ name, tin: tin || null });
    }
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {mutation.error && (
        <p className="rounded-sm border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {mutation.error.message}
        </p>
      )}

      <Field label="Supplier name">
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </Field>

      {similarOthers.length > 0 && (
        <p className="rounded-sm border border-warn bg-warn-soft px-3 py-2 text-sm text-ink">
          Similar suppliers already exist: {similarOthers.map((s) => s.name).join(', ')}
        </p>
      )}

      <Field label="TIN">
        <input
          type="text"
          value={tin ?? ''}
          onChange={(e) => setTin(e.target.value)}
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </Field>

      {isEdit && (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
      )}

      <div className="flex justify-end gap-3 border-t border-rule pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm border border-rule-strong px-4 py-2 text-sm text-ink-muted hover:bg-canvas"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add supplier'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { children: React.ReactNode; label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{label}</span>
      {children}
    </label>
  );
}
