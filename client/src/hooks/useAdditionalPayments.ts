import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteRequest, fetchJson, patchJson, postJson } from '../lib/api';
import type { AdditionalPayment, AdditionalPaymentLineInput } from '../types';
import { PROJECT_ID } from './useProjectData';

export function useCreateAdditionalPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { lines: AdditionalPaymentLineInput[]; document_no?: string; total_amount?: string }) =>
      postJson(`/api/projects/${PROJECT_ID}/additional-payments`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['additional-payments', PROJECT_ID] }),
  });
}

export function useUpdateAdditionalPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<AdditionalPaymentLineInput> & { id: number; needs_review?: 0 | 1 }) =>
      patchJson(`/api/projects/${PROJECT_ID}/additional-payments/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['additional-payments', PROJECT_ID] }),
  });
}

// "Delete" voids -- the row disappears from every list/total exactly like
// removing it from the spreadsheet, but stays restorable from the
// "Deleted items" view (see useVoidedAdditionalPayments).
export function useVoidAdditionalPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      deleteRequest(`/api/projects/${PROJECT_ID}/additional-payments/${id}`, reason ? { reason } : undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['additional-payments', PROJECT_ID] }),
  });
}

export function useRestoreAdditionalPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => postJson(`/api/projects/${PROJECT_ID}/additional-payments/${id}/restore`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['additional-payments', PROJECT_ID] }),
  });
}

export function useVoidedAdditionalPayments(enabled: boolean) {
  return useQuery({
    queryKey: ['additional-payments', PROJECT_ID, 'voided'],
    queryFn: () =>
      fetchJson<{ rows: AdditionalPayment[] }>(
        `/api/projects/${PROJECT_ID}/additional-payments?voided=1&pageSize=200`,
      ),
    enabled,
  });
}
