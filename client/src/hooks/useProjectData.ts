import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '../lib/api';
import type { BudgetSummaryRow, ProjectKpis } from '../types';

// No multi-tenancy in the UI (CLAUDE.md) -- single project, hardcoded.
export const PROJECT_ID = 1;

export function useProjectSummary() {
  return useQuery({
    queryKey: ['project-summary', PROJECT_ID],
    queryFn: () => fetchJson<BudgetSummaryRow[]>(`/api/projects/${PROJECT_ID}/summary`),
  });
}

export function useProjectKpis() {
  return useQuery({
    queryKey: ['project-kpis', PROJECT_ID],
    queryFn: () => fetchJson<ProjectKpis>(`/api/projects/${PROJECT_ID}/kpis`),
  });
}
