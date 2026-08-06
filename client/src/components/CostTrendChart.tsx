import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import type { CostTrendPoint } from '../types';

Chart.register(...registerables);

const CATEGORIES: { color: string; key: keyof CostTrendPoint; label: string }[] = [
  { key: 'payroll', label: 'Payroll', color: '#0F6B5C' },
  { key: 'replenishments', label: 'Replenishments', color: '#5B8DEF' },
  { key: 'po_payments', label: 'PO Payments', color: '#B08BE0' },
  { key: 'cash_advances', label: 'Cash Advances', color: '#E0A458' },
  { key: 'additional_payments', label: 'Additional Payments', color: '#E2725B' },
];

function readVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Chart.js reads plain numbers for plotting -- this is display-only, same
// as formatMoney.ts's own Number(value) use for a single already-computed
// DECIMAL string. No summation happens here (the server already summed).
export function CostTrendChart({ data }: { data: CostTrendPoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const textColor = readVar('--color-ink-muted');
    const isDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(16,32,28,0.06)';

    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: data.map((d) => d.month),
        datasets: CATEGORIES.map((cat) => ({
          label: cat.label,
          data: data.map((d) => Number(d[cat.key])),
          borderColor: cat.color,
          backgroundColor: `${cat.color}33`,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2,
          stack: 'a',
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ₱${Number(ctx.parsed.y).toLocaleString()}` } },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: textColor } },
          y: {
            stacked: true,
            grid: { color: gridColor },
            ticks: { color: textColor, callback: (v) => `₱${Number(v).toLocaleString()}` },
          },
        },
      },
    });

    return () => chartRef.current?.destroy();
  }, [data]);

  return (
    <div className="h-65">
      <canvas ref={canvasRef} />
    </div>
  );
}
