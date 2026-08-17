import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '../lib/api';
import type { BudgetSummaryRow, ProjectKpis } from '../types';

// No multi-tenancy in the UI (CLAUDE.md) -- single project, hardcoded.
// Which project this deployment points at lives in site.config.ts.
import { PROJECT_ID } from '../site.config';
export { PROJECT_ID };

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
