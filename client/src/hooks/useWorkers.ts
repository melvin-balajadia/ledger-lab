import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, patchJson, postJson } from '../lib/api';
import type { Worker, WorkerListResponse, WorkerPayrollEntriesResponse } from '../types';
import { PROJECT_ID } from './useProjectData';

// Small lookup for the near-duplicate-name warning on the create/edit form --
// same non-blocking pattern as SupplierForm's name check.
export function useWorkerSearch(q: string) {
  return useQuery({
    queryKey: ['worker-search', PROJECT_ID, q],
    queryFn: () =>
      fetchJson<WorkerListResponse>(
        `/api/projects/${PROJECT_ID}/workers?page=1&pageSize=5&search=${encodeURIComponent(q)}`,
      ),
    enabled: q.length >= 3,
    staleTime: 30 * 1000,
  });
}

// One worker's entries across every period -- bounded by the number of
// payroll periods that exist (≤1 entry per week), fetched once and
// paginated/sorted client-side via clientPaginate.
export function useWorkerPayrollEntries(workerId: number | null) {
  return useQuery({
    queryKey: ['worker-payroll-entries', PROJECT_ID, workerId],
    queryFn: () => fetchJson<WorkerPayrollEntriesResponse>(`/api/projects/${PROJECT_ID}/workers/${workerId}/payroll-entries`),
    enabled: workerId != null,
  });
}

// Distinct position values across all workers -- small, bounded set,
// fetched once and filtered client-side for the near-duplicate suggestion.
export function useWorkerPositions() {
  return useQuery({
    queryKey: ['worker-positions', PROJECT_ID],
    queryFn: () => fetchJson<{ values: string[] }>(`/api/projects/${PROJECT_ID}/workers/positions`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateWorker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      last_name: string;
      first_name: string;
      middle_name?: string | null;
      employee_no?: string | null;
      position?: string | null;
      date_hired?: string | null;
    }) => postJson<Worker>(`/api/projects/${PROJECT_ID}/workers`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['worker-positions'] }),
  });
}

export function useUpdateWorker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      last_name?: string;
      first_name?: string;
      middle_name?: string | null;
      employee_no?: string | null;
      position?: string | null;
      date_hired?: string | null;
      is_active?: 0 | 1;
      date_separated?: string | null;
    }) => patchJson<Worker>(`/api/projects/${PROJECT_ID}/workers/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-positions'] });
      queryClient.invalidateQueries({ queryKey: ['worker-payroll-entries'] });
    },
  });
}
