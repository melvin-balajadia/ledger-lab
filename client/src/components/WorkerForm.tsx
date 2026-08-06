import { useState } from 'react';
import { useCreateWorker, useUpdateWorker, useWorkerPositions, useWorkerSearch } from '../hooks/useWorkers';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { Worker } from '../types';

export function WorkerForm({ worker, onClose }: { onClose: () => void; worker?: Worker }) {
  const isEdit = Boolean(worker);
  const createMutation = useCreateWorker();
  const updateMutation = useUpdateWorker();
  const mutation = isEdit ? updateMutation : createMutation;

  const [lastName, setLastName] = useState(worker?.last_name ?? '');
  const [firstName, setFirstName] = useState(worker?.first_name ?? '');
  const [middleName, setMiddleName] = useState(worker?.middle_name ?? '');
  const [employeeNo, setEmployeeNo] = useState(worker?.employee_no ?? '');
  const [position, setPosition] = useState(worker?.position ?? '');
  const [dateHired, setDateHired] = useState(worker?.date_hired ?? '');
  const [isActive, setIsActive] = useState(Boolean(worker?.is_active ?? true));
  const [dateSeparated, setDateSeparated] = useState(worker?.date_separated ?? '');

  // Stored full_name is "LAST, FIRST[ MIDDLE]" -- reconstruct the same
  // separator so the server's substring search actually matches it.
  const debouncedName = useDebouncedValue(firstName ? `${lastName}, ${firstName}` : lastName, 300);
  const { data: nameMatches } = useWorkerSearch(debouncedName.trim().length >= 3 ? debouncedName : '');
  const similarWorkers = (nameMatches?.rows ?? []).filter((w) => w.id !== worker?.id);

  const { data: positionsData } = useWorkerPositions();
  const debouncedPosition = useDebouncedValue(position, 300);
  const similarPositions = (positionsData?.values ?? []).filter(
    (p) =>
      debouncedPosition.trim().length >= 3 &&
      p.toLowerCase() !== debouncedPosition.trim().toLowerCase() &&
      p.toLowerCase().includes(debouncedPosition.trim().toLowerCase()),
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (isEdit && worker) {
      await updateMutation.mutateAsync({
        id: worker.id,
        last_name: lastName,
        first_name: firstName,
        middle_name: middleName || null,
        employee_no: employeeNo || null,
        position: position || null,
        date_hired: dateHired || null,
        is_active: isActive ? 1 : 0,
        date_separated: isActive ? null : dateSeparated || undefined,
      });
    } else {
      await createMutation.mutateAsync({
        last_name: lastName,
        first_name: firstName,
        middle_name: middleName || null,
        employee_no: employeeNo || null,
        position: position || null,
        date_hired: dateHired || null,
      });
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Last name">
          <input
            type="text"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </Field>
        <Field label="First name">
          <input
            type="text"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </Field>
        <Field label="Middle name">
          <input
            type="text"
            value={middleName ?? ''}
            onChange={(e) => setMiddleName(e.target.value)}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </Field>
      </div>

      {similarWorkers.length > 0 && (
        <p className="rounded-sm border border-warn bg-warn-soft px-3 py-2 text-sm text-ink">
          Similar workers already exist: {similarWorkers.map((w) => w.full_name).join(', ')}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Employee no.">
          <input
            type="text"
            value={employeeNo ?? ''}
            onChange={(e) => setEmployeeNo(e.target.value)}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </Field>
        <Field label="Date hired">
          <input
            type="date"
            value={dateHired ?? ''}
            onChange={(e) => setDateHired(e.target.value)}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </Field>
      </div>

      <Field label="Position">
        <input
          type="text"
          value={position ?? ''}
          onChange={(e) => setPosition(e.target.value)}
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </Field>

      {similarPositions.length > 0 && (
        <p className="rounded-sm border border-warn bg-warn-soft px-3 py-2 text-sm text-ink">
          Similar positions already in use: {similarPositions.join(', ')}
        </p>
      )}

      {isEdit && (
        <div className="flex flex-col gap-3 border-t border-rule pt-4">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
          {!isActive && (
            <Field label="Date separated">
              <input
                type="date"
                value={dateSeparated ?? ''}
                onChange={(e) => setDateSeparated(e.target.value)}
                className="w-full max-w-xs rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            </Field>
          )}
        </div>
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
          {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add worker'}
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
