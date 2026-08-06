import { useMutation } from '@tanstack/react-query';
import { postJson } from '../lib/api';

export interface BackupResult {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export function useBackupNow() {
  return useMutation({
    mutationFn: () => postJson<BackupResult>('/api/backup', {}),
  });
}
