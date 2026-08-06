import { useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useSuppliers } from '../hooks/useSuppliers';
import type { Supplier } from '../types';

export function SupplierAutocomplete({
  value,
  onChange,
  hasIcon = false,
}: {
  hasIcon?: boolean;
  onChange: (supplier: Supplier | null) => void;
  value: Supplier | null;
}) {
  const [inputValue, setInputValue] = useState(value?.name ?? '');
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebouncedValue(inputValue, 250);
  const { data: options = [] } = useSuppliers(isOpen ? debouncedQuery : '');

  useEffect(() => {
    setInputValue(value?.name ?? '');
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

  function select(supplier: Supplier) {
    onChange(supplier);
    setInputValue(supplier.name);
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
        placeholder="Type a supplier name…"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        className={`w-full rounded-sm border border-rule-strong bg-surface py-2 text-sm text-ink outline-none focus:border-accent ${hasIcon ? 'pr-3 pl-9' : 'px-3'}`}
      />
      {isOpen && inputValue.length > 0 && (
        <ul role="listbox" className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto border border-rule-strong bg-surface shadow-lg">
          {options.length === 0 && <li className="px-3 py-2 text-sm text-ink-faint">No matching suppliers</li>}
          {options.map((supplier, i) => (
            <li
              key={supplier.id}
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={() => select(supplier)}
              onMouseEnter={() => setHighlighted(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${i === highlighted ? 'bg-accent-soft text-ink' : 'text-ink'}`}
            >
              {supplier.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
