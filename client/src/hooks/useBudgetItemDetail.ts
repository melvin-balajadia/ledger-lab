import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, patchJson, postJson } from '../lib/api';
import type { BudgetItemDetail, BudgetItemInput, BudgetItemPatch, RevisionInput } from '../types';
import { PROJECT_ID } from './useProjectData';

// A budget figure feeds the Overview's KPI cards, its budget table and the
// over-budget alerts, none of which are keyed on the item being edited -- so
// invalidating only ['budget-item'] left every one of them showing the old
// number until a manual refresh.
function invalidateBudget(queryClient: ReturnType<typeof useQueryClient>, budgetItemId?: number) {
  if (budgetItemId !== undefined) {
    queryClient.invalidateQueries({ queryKey: ['budget-item', PROJECT_ID, budgetItemId] });
  }
  queryClient.invalidateQueries({ queryKey: ['project-summary', PROJECT_ID] });
  queryClient.invalidateQueries({ queryKey: ['project-kpis', PROJECT_ID] });
  queryClient.invalidateQueries({ queryKey: ['alerts', PROJECT_ID] });
}

export function useBudgetItemDetail(budgetItemId: number) {
  return useQuery({
    queryKey: ['budget-item', PROJECT_ID, budgetItemId],
    queryFn: () => fetchJson<BudgetItemDetail>(`/api/projects/${PROJECT_ID}/budget-items/${budgetItemId}`),
  });
}

export function useCreateBudgetItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BudgetItemInput) => postJson<BudgetItemDetail>(`/api/projects/${PROJECT_ID}/budget-items`, body),
    onSuccess: () => {
      invalidateBudget(queryClient);
      // Creating an item re-points any JPL code whose first segment names it
      // (server-side relink), which changes the WBS tree's grouping.
      queryClient.invalidateQueries({ queryKey: ['planning-lines'] });
      queryClient.invalidateQueries({ queryKey: ['wbs'] });
    },
  });
}

export function useRecordRevision(budgetItemId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RevisionInput) =>
      postJson<BudgetItemDetail>(`/api/projects/${PROJECT_ID}/budget-items/${budgetItemId}/revisions`, body),
    onSuccess: () => invalidateBudget(queryClient, budgetItemId),
  });
}

export function useUpdateBudgetItem(budgetItemId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BudgetItemPatch) =>
      patchJson<BudgetItemDetail>(`/api/projects/${PROJECT_ID}/budget-items/${budgetItemId}`, body),
    onSuccess: () => invalidateBudget(queryClient, budgetItemId),
  });
}
