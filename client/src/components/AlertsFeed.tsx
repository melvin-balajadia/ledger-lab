import type { AlertSeverity, DashboardAlert } from '../types';
import { IconAlertCircle, IconAlertTriangle, IconCheckCircle, IconInfo } from './icons';
import { toneClasses } from '../lib/tones';

const severityIcon: Record<AlertSeverity, typeof IconInfo> = {
  danger: IconAlertTriangle,
  warn: IconAlertCircle,
  success: IconCheckCircle,
  info: IconInfo,
};

function formatDate(date: string | null) {
  if (!date) return null;
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function AlertsFeed({ alerts }: { alerts: DashboardAlert[] }) {
  if (alerts.length === 0) {
    return <p className="text-sm text-ink-faint">Nothing flagged right now.</p>;
  }

  return (
    <div className="flex flex-col">
      {alerts.map((alert, i) => {
        const Icon = severityIcon[alert.severity];
        const { bg, text } = toneClasses[alert.severity];
        const displayDate = formatDate(alert.date);
        return (
          <div key={i} className={`flex gap-3 py-3.5 ${i < alerts.length - 1 ? 'border-b border-rule' : ''}`}>
            <span className={`flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-md ${bg} ${text}`}>
              <Icon className="h-3.75 w-3.75" />
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-[13px] leading-snug text-ink">{alert.message}</p>
              {displayDate && <span className="text-[11px] text-ink-faint">{displayDate}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
