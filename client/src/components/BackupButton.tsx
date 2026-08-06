import { useState } from 'react';
import { useBackupNow } from '../hooks/useBackup';
import { IconDownload } from './icons';

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

// Global, not tied to any one screen -- she might want this right before
// editing a PO, a payroll entry, anything. Mirrors scripts/backup-db.ps1's
// scheduled nightly dump, just triggerable on demand.
export function BackupButton() {
  const backup = useBackupNow();
  const [savedLabel, setSavedLabel] = useState<string | null>(null);

  async function handleClick() {
    setSavedLabel(null);
    const result = await backup.mutateAsync().catch(() => null);
    if (result) {
      setSavedLabel(`Saved ${formatSize(result.sizeBytes)}`);
      setTimeout(() => setSavedLabel(null), 5000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {savedLabel && <span className="text-xs font-medium text-success">{savedLabel}</span>}
      {backup.error && <span className="text-xs font-medium text-danger">{backup.error.message}</span>}
      <button
        type="button"
        onClick={handleClick}
        disabled={backup.isPending}
        title="Back up the database now"
        className="inline-flex items-center gap-1.5 rounded-sm border border-rule-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-60"
      >
        <IconDownload className="h-3.75 w-3.75" />
        {backup.isPending ? 'Backing up…' : 'Backup now'}
      </button>
    </div>
  );
}
