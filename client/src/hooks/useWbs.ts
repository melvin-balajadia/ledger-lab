import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '../lib/api';
import type { WbsRow } from '../types';
import { PROJECT_ID } from './useProjectData';

export function useWbs(budgetItemId: number) {
  return useQuery({
    queryKey: ['wbs', PROJECT_ID, budgetItemId],
    queryFn: () => fetchJson<WbsRow[]>(`/api/projects/${PROJECT_ID}/wbs?budget_item_id=${budgetItemId}`),
  });
}
