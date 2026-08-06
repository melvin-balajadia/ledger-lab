import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteRequest, fetchJson, patchJson, postJson } from '../lib/api';
import type { Replenishment, ReplenishmentLineInput } from '../types';
import { PROJECT_ID } from './useProjectData';

export function useCreateReplenishment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { lines: ReplenishmentLineInput[]; document_no?: string; total_amount?: string }) =>
      postJson(`/api/projects/${PROJECT_ID}/replenishments`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['replenishments', PROJECT_ID] }),
  });
}

export function useUpdateReplenishment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<ReplenishmentLineInput> & { id: number; needs_review?: 0 | 1 }) =>
      patchJson(`/api/projects/${PROJECT_ID}/replenishments/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['replenishments', PROJECT_ID] }),
  });
}

// "Delete" voids -- the row disappears from every list/total exactly like
// removing it from the spreadsheet, but stays restorable from the
// "Deleted items" view (see useVoidedReplenishments).
export function useVoidReplenishment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      deleteRequest(`/api/projects/${PROJECT_ID}/replenishments/${id}`, reason ? { reason } : undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['replenishments', PROJECT_ID] }),
  });
}

export function useRestoreReplenishment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => postJson(`/api/projects/${PROJECT_ID}/replenishments/${id}/restore`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['replenishments', PROJECT_ID] }),
  });
}

export function useVoidedReplenishments(enabled: boolean) {
  return useQuery({
    queryKey: ['replenishments', PROJECT_ID, 'voided'],
    queryFn: () =>
      fetchJson<{ rows: Replenishment[] }>(
        `/api/projects/${PROJECT_ID}/replenishments?voided=1&pageSize=200`,
      ),
    enabled,
  });
}
