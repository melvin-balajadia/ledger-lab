import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, patchJson, postJson } from '../lib/api';
import type { PlanningLine } from '../types';
import { PROJECT_ID } from './useProjectData';

export function usePlanningLines() {
  return useQuery({
    queryKey: ['planning-lines', PROJECT_ID],
    queryFn: () => fetchJson<PlanningLine[]>(`/api/projects/${PROJECT_ID}/planning-lines`),
    staleTime: 5 * 60 * 1000,
  });
}

function invalidatePlanningLines(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['planning-lines'] });
  queryClient.invalidateQueries({ queryKey: ['wbs'] });
}

export function useCreatePlanningLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string; description?: string | null; budget_amount?: string | null }) =>
      postJson<PlanningLine>(`/api/projects/${PROJECT_ID}/planning-lines`, body),
    onSuccess: () => invalidatePlanningLines(queryClient),
  });
}

export function useUpdatePlanningLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      code?: string;
      description?: string | null;
      budget_amount?: string | null;
      is_active?: 0 | 1;
    }) => patchJson<PlanningLine>(`/api/projects/${PROJECT_ID}/planning-lines/${id}`, body),
    onSuccess: () => invalidatePlanningLines(queryClient),
  });
}
