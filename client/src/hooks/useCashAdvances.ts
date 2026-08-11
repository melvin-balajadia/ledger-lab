import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteRequest, fetchJson, patchJson, postJson } from '../lib/api';
import type { CashAdvance, CashAdvanceLineInput } from '../types';
import { PROJECT_ID } from './useProjectData';

export function useCreateCashAdvance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { lines: CashAdvanceLineInput[]; document_no?: string; total_amount?: string }) =>
      postJson(`/api/projects/${PROJECT_ID}/cash-advances`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cash-advances', PROJECT_ID] }),
  });
}

export function useUpdateCashAdvance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: Partial<CashAdvanceLineInput> & {
      id: number;
      liquidated_amount?: string;
      status?: string;
      liquidation_control_no?: string;
      needs_review?: 0 | 1;
    }) =>
      patchJson(`/api/projects/${PROJECT_ID}/cash-advances/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cash-advances', PROJECT_ID] }),
  });
}

// "Delete" voids -- the row disappears from every list/total exactly like
// removing it from the spreadsheet, but stays restorable from the
// "Deleted items" view (see useVoidedCashAdvances).
export function useVoidCashAdvance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      deleteRequest(`/api/projects/${PROJECT_ID}/cash-advances/${id}`, reason ? { reason } : undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cash-advances', PROJECT_ID] }),
  });
}

export function useRestoreCashAdvance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => postJson(`/api/projects/${PROJECT_ID}/cash-advances/${id}/restore`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cash-advances', PROJECT_ID] }),
  });
}

export function useVoidedCashAdvances(enabled: boolean) {
  return useQuery({
    queryKey: ['cash-advances', PROJECT_ID, 'voided'],
    queryFn: () =>
      fetchJson<{ rows: CashAdvance[] }>(`/api/projects/${PROJECT_ID}/cash-advances?voided=1&pageSize=200`),
    enabled,
  });
}
