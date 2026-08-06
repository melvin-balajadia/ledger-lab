import { usePlanningLines } from '../hooks/usePlanningLines';
import { useProjectSummary } from '../hooks/useProjectData';
import { compareCodes } from '../lib/sortCodes';
import type { PlanningLine } from '../types';

export function PlanningLinePicker({
  value,
  onChange,
  hasIcon = false,
  className,
}: {
  hasIcon?: boolean;
  onChange: (line: PlanningLine | null) => void;
  value: number | null;
  className?: string;
}) {
  const { data: allLines = [] } = usePlanningLines();
  const { data: summary = [] } = useProjectSummary();

  // Inactive codes drop out of the picker for new selections, but a
  // historical entry already pointing at a since-deactivated code must
  // still show its current value rather than rendering blank.
  const lines = allLines.filter((line) => line.is_active !== 0 || line.id === value);

  const descriptionByItemNo = new Map(summary.map((row) => [row.item_no, row.description]));

  const groups = new Map<string, PlanningLine[]>();
  for (const line of lines) {
    const prefix = `${line.code.split('.')[0]}.0`;
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix)!.push(line);
  }
  const sortedPrefixes = [...groups.keys()].sort(compareCodes);

  return (
    <select
      value={value ?? ''}
      onChange={(e) => {
        const id = e.target.value ? Number(e.target.value) : null;
        onChange(lines.find((line) => line.id === id) ?? null);
      }}
      className={
        className ??
        `w-full rounded-sm border border-rule-strong bg-surface py-2 text-sm text-ink outline-none focus:border-accent ${hasIcon ? 'pr-3 pl-9' : 'px-3'}`
      }
    >
      <option value="">Select a JPL / WBS code…</option>
      {sortedPrefixes.map((prefix) => {
        const label = descriptionByItemNo.get(prefix) ? `${prefix} ${descriptionByItemNo.get(prefix)}` : prefix;
        const options = [...groups.get(prefix)!].sort((a, b) => compareCodes(a.code, b.code));
        return (
          <optgroup key={prefix} label={label}>
            {options.map((line) => (
              <option key={line.id} value={line.id}>
                {line.code}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
