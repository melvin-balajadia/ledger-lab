import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { formatMoney, sumMoney } from '../lib/formatMoney';
import type { CostBreakdown } from '../types';

Chart.register(...registerables);

const CATEGORIES: { color: string; key: keyof CostBreakdown; label: string }[] = [
  { key: 'payroll', label: 'Payroll', color: '#0F6B5C' },
  { key: 'replenishments', label: 'Replenishments', color: '#5B8DEF' },
  { key: 'po_payments', label: 'PO Payments', color: '#B08BE0' },
  { key: 'cash_advances', label: 'Cash Advances', color: '#E0A458' },
  { key: 'additional_payments', label: 'Additional Payments', color: '#E2725B' },
];

export function CostBreakdownDonut({ data }: { data: CostBreakdown }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const total = sumMoney(CATEGORIES.map((c) => data[c.key]));

  useEffect(() => {
    if (!canvasRef.current) return;
    const surface = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim();

    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels: CATEGORIES.map((c) => c.label),
        datasets: [
          {
            data: CATEGORIES.map((c) => Number(data[c.key])),
            backgroundColor: CATEGORIES.map((c) => c.color),
            borderColor: surface || '#FFFFFF',
            borderWidth: 3,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ₱${Number(ctx.parsed).toLocaleString()}` } },
        },
      },
    });

    return () => chartRef.current?.destroy();
  }, [data]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-50 w-full">
        <canvas ref={canvasRef} />
        <div className="pointer-events-none absolute top-[44%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="font-mono text-lg font-semibold text-ink">{formatMoney(total)}</div>
          <div className="text-[11px] text-ink-faint">total cost</div>
        </div>
      </div>
      <div className="mt-3.5 flex flex-wrap justify-center gap-3">
        {CATEGORIES.map((c) => {
          const pct = Number(total) > 0 ? ((Number(data[c.key]) / Number(total)) * 100).toFixed(0) : '0';
          return (
            <span key={c.key} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: c.color }} />
              {c.label} · {pct}%
            </span>
          );
        })}
      </div>
    </div>
  );
}
