import { useState } from 'react';
import { useBackupNow } from '../hooks/useBackup';
import { Tooltip } from './Tooltip';
import { IconCheck, IconDownload, IconRefresh } from './icons';

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

// Global, not tied to any one screen -- she might want this right before
// editing a PO, a payroll entry, anything. Mirrors scripts/backup-db.ps1's
// scheduled nightly dump, just triggerable on demand.
//
// A quiet icon button in the top bar (Royale: ghost, with a Tooltip and its
// own aria-label). Its result shows beside it for a few seconds: "Backed up"
// with the file size, or the reason it failed.
export function BackupButton() {
  const backup = useBackupNow();
  const [savedLabel, setSavedLabel] = useState<string | null>(null);

  async function handleClick() {
    setSavedLabel(null);
    const result = await backup.mutateAsync().catch(() => null);
    if (result) {
      setSavedLabel(`Backed up · ${formatSize(result.sizeBytes)}`);
      setTimeout(() => setSavedLabel(null), 5000);
    }
  }

  const label = backup.isPending ? 'Backing up…' : 'Back up now';

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {savedLabel && (
        <span role="status" className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-success">
          <IconCheck className="h-3.5 w-3.5" />
          {savedLabel}
        </span>
      )}
      {backup.error && (
        <span role="alert" className="max-w-60 truncate text-xs font-medium text-danger" title={backup.error.message}>
          Backup failed: {backup.error.message}
        </span>
      )}
      <Tooltip label={label} placement="bottom-end">
        <button
          type="button"
          onClick={handleClick}
          disabled={backup.isPending}
          aria-label={label}
          className="rounded-sm p-2 text-ink-muted outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
        >
          {backup.isPending ? (
            <IconRefresh className="h-4.5 w-4.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <IconDownload className="h-4.5 w-4.5" />
          )}
        </button>
      </Tooltip>
    </div>
  );
}
