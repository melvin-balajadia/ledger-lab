import { useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useWorkerSearch } from '../hooks/useWorkers';
import type { Worker } from '../types';

export function WorkerAutocomplete({
  value,
  onChange,
  hasIcon = false,
}: {
  hasIcon?: boolean;
  onChange: (worker: Worker | null) => void;
  value: Worker | null;
}) {
  const [inputValue, setInputValue] = useState(value?.full_name ?? '');
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebouncedValue(inputValue, 250);
  const { data } = useWorkerSearch(isOpen && debouncedQuery.trim().length >= 2 ? debouncedQuery : '');
  const options = data?.rows ?? [];

  useEffect(() => {
    setInputValue(value?.full_name ?? '');
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function select(worker: Worker) {
    onChange(worker);
    setInputValue(worker.full_name);
    setIsOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!isOpen || options.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((i) => Math.min(i + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      select(options[highlighted]);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setIsOpen(true);
          setHighlighted(0);
          if (value) onChange(null);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Type a worker name…"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        className={`w-full rounded-sm border border-rule-strong bg-surface py-2 text-sm text-ink outline-none focus:border-accent ${hasIcon ? 'pr-3 pl-9' : 'px-3'}`}
      />
      {isOpen && inputValue.length > 0 && (
        <ul role="listbox" className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto border border-rule-strong bg-surface shadow-lg">
          {options.length === 0 && <li className="px-3 py-2 text-sm text-ink-faint">No matching workers</li>}
          {options.map((worker, i) => (
            <li
              key={worker.id}
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={() => select(worker)}
              onMouseEnter={() => setHighlighted(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${i === highlighted ? 'bg-accent-soft text-ink' : 'text-ink'}`}
            >
              {worker.full_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
