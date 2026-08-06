import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, patchJson, postJson } from '../lib/api';
import type { BudgetItemDetail, RevisionInput } from '../types';
import { PROJECT_ID } from './useProjectData';

export function useBudgetItemDetail(budgetItemId: number) {
  return useQuery({
    queryKey: ['budget-item', PROJECT_ID, budgetItemId],
    queryFn: () => fetchJson<BudgetItemDetail>(`/api/projects/${PROJECT_ID}/budget-items/${budgetItemId}`),
  });
}

export function useRecordRevision(budgetItemId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RevisionInput) =>
      postJson<BudgetItemDetail>(`/api/projects/${PROJECT_ID}/budget-items/${budgetItemId}/revisions`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget-item', PROJECT_ID, budgetItemId] }),
  });
}

export function useUpdateBudgetItem(budgetItemId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { procurement_mode?: string; remarks?: string | null }) =>
      patchJson<BudgetItemDetail>(`/api/projects/${PROJECT_ID}/budget-items/${budgetItemId}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget-item', PROJECT_ID, budgetItemId] }),
  });
}
