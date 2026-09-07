import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '../lib/api';
import type { WbsRow, WbsTransaction } from '../types';
import { PROJECT_ID } from './useProjectData';

// Omit budgetItemId for every planning line on the project -- the route's
// budget_item_id filter is optional, and the Overview's JPL summary wants
// the lot (127 rows, one request, grouped client-side).
export function useWbs(budgetItemId?: number) {
  return useQuery({
    queryKey: ['wbs', PROJECT_ID, budgetItemId ?? 'all'],
    queryFn: () =>
      fetchJson<WbsRow[]>(
        budgetItemId == null
          ? `/api/projects/${PROJECT_ID}/wbs`
          : `/api/projects/${PROJECT_ID}/wbs?budget_item_id=${budgetItemId}`,
      ),
  });
}

// The transactions making up one JPL code's figures. Only fetched once a code
// is actually opened -- pass null while the drill-down is closed.
export function useWbsTransactions(planningLineId: number | null) {
  return useQuery({
    queryKey: ['wbs-transactions', PROJECT_ID, planningLineId],
    enabled: planningLineId != null,
    queryFn: () =>
      fetchJson<WbsTransaction[]>(`/api/projects/${PROJECT_ID}/wbs/${planningLineId}/transactions`),
  });
}
