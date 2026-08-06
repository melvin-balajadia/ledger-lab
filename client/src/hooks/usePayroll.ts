import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteRequest, fetchJson, patchJson, postJson } from '../lib/api';
import type { CopyRosterSource, PayrollEntry, PayrollPeriod, PayrollPeriodListResponse, PayrollWorkflowStatus } from '../types';
import { PROJECT_ID } from './useProjectData';

export function usePayrollPeriod(periodId: number | null) {
  return useQuery({
    queryKey: ['payroll-period', PROJECT_ID, periodId],
    queryFn: () => fetchJson<PayrollPeriod>(`/api/projects/${PROJECT_ID}/payroll-periods/${periodId}`),
    enabled: periodId != null,
  });
}

// One period's entries is a small, naturally bounded list (however many
// workers were active that week) -- fetched once and paginated/sorted
// client-side via clientPaginate, not a new server endpoint.
export function usePayrollEntries(periodId: number | null) {
  return useQuery({
    queryKey: ['payroll-entries', PROJECT_ID, periodId],
    queryFn: () => fetchJson<PayrollEntry[]>(`/api/projects/${PROJECT_ID}/payroll-periods/${periodId}/entries`),
    enabled: periodId != null,
  });
}

// Prefill for the "+ New period" form -- next Monday-Sunday range and label,
// computed from the latest existing period. She can edit every field before
// submitting, so this is a convenience, not the source of truth.
export function useNextPeriodSuggestion(enabled: boolean) {
  return useQuery({
    queryKey: ['payroll-next-suggestion', PROJECT_ID],
    queryFn: () =>
      fetchJson<{ period_start: string; period_end: string; label: string }>(
        `/api/projects/${PROJECT_ID}/payroll-periods/next-suggestion`,
      ),
    enabled,
    staleTime: 0,
  });
}

function invalidatePeriod(queryClient: ReturnType<typeof useQueryClient>, periodId: number) {
  queryClient.invalidateQueries({ queryKey: ['payroll-period', PROJECT_ID, periodId] });
  queryClient.invalidateQueries({ queryKey: ['payroll-entries', PROJECT_ID, periodId] });
}

export function useCreatePayrollPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { label: string; period_start: string; period_end: string; total_amount?: string }) =>
      postJson<PayrollPeriod>(`/api/projects/${PROJECT_ID}/payroll-periods`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payroll-next-suggestion'] }),
  });
}

export function useUpdatePayrollPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      label?: string;
      period_start?: string;
      period_end?: string;
      total_amount?: string;
      status?: PayrollWorkflowStatus;
    }) => patchJson<PayrollPeriod>(`/api/projects/${PROJECT_ID}/payroll-periods/${id}`, body),
    onSuccess: (_data, variables) => invalidatePeriod(queryClient, variables.id),
  });
}

// The period the "Copy roster" button would use if clicked as-is -- lets
// the button be labeled with the actual source before she commits to it,
// instead of finding out only after a failed attempt.
export function useCopyRosterSource(periodId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['copy-roster-source', PROJECT_ID, periodId],
    queryFn: () =>
      fetchJson<{ source: CopyRosterSource | null }>(
        `/api/projects/${PROJECT_ID}/payroll-periods/${periodId}/copy-roster-source`,
      ),
    enabled,
  });
}

// Candidates for the "change source period" override -- any earlier period
// that actually has a roster. Reuses the existing paginated periods list
// rather than a new endpoint; filtered to populated ones client-side.
export function useRecentPopulatedPeriods(excludePeriodId: number, beforeDate: string, enabled: boolean) {
  return useQuery({
    queryKey: ['payroll-periods-recent', PROJECT_ID, beforeDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: '1',
        pageSize: '20',
        date_to: beforeDate,
        sortKey: 'period_start',
        sortDir: 'desc',
      });
      const json = await fetchJson<PayrollPeriodListResponse>(
        `/api/projects/${PROJECT_ID}/payroll-periods?${params}`,
      );
      return json.rows.filter((row) => row.entry_count > 0 && row.id !== excludePeriodId);
    },
    enabled,
  });
}

export function useCopyRosterForward(periodId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourcePeriodId?: number) =>
      postJson<{ copied_from_period_id: number; entries_copied: number; entries_skipped: number }>(
        `/api/projects/${PROJECT_ID}/payroll-periods/${periodId}/copy-roster`,
        { source_period_id: sourcePeriodId },
      ),
    onSuccess: () => {
      invalidatePeriod(queryClient, periodId);
      queryClient.invalidateQueries({ queryKey: ['copy-roster-source', PROJECT_ID, periodId] });
    },
  });
}

export function useCreatePayrollEntry(periodId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { worker_id: number; planning_line_id?: number | null; budget_item_id?: number | null; amount: string }) =>
      postJson<PayrollEntry>(`/api/projects/${PROJECT_ID}/payroll-periods/${periodId}/entries`, body),
    onSuccess: () => invalidatePeriod(queryClient, periodId),
  });
}

export function useUpdatePayrollEntry(periodId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      entryId,
      ...body
    }: {
      entryId: number;
      planning_line_id?: number | null;
      budget_item_id?: number | null;
      amount?: string;
    }) => patchJson<PayrollEntry>(`/api/projects/${PROJECT_ID}/payroll-periods/${periodId}/entries/${entryId}`, body),
    onSuccess: () => invalidatePeriod(queryClient, periodId),
  });
}

export function useDeletePayrollEntry(periodId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: number) =>
      deleteRequest(`/api/projects/${PROJECT_ID}/payroll-periods/${periodId}/entries/${entryId}`),
    onSuccess: () => invalidatePeriod(queryClient, periodId),
  });
}

// Recovery path for "copied from the wrong period" -- one confirmation
// instead of deleting each row individually. Fires the existing per-row
// DELETE in parallel and invalidates once at the end, rather than once per
// row (the single-entry mutation's own invalidation would otherwise refetch
// redundantly dozens of times for a large selection).
export function useDeletePayrollEntries(periodId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryIds: number[]) =>
      Promise.all(
        entryIds.map((entryId) =>
          deleteRequest(`/api/projects/${PROJECT_ID}/payroll-periods/${periodId}/entries/${entryId}`),
        ),
      ),
    onSuccess: () => invalidatePeriod(queryClient, periodId),
  });
}

// Server-side, the DELETE above voids rather than hard-deletes -- the entry
// disappears from the period's total exactly like removing it from the
// spreadsheet, but stays restorable here.
export function useVoidedPayrollEntries(periodId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ['payroll-entries', PROJECT_ID, periodId, 'voided'],
    queryFn: () =>
      fetchJson<PayrollEntry[]>(`/api/projects/${PROJECT_ID}/payroll-periods/${periodId}/entries?voided=1`),
    enabled: enabled && periodId != null,
  });
}

export function useRestorePayrollEntry(periodId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: number) =>
      postJson(`/api/projects/${PROJECT_ID}/payroll-periods/${periodId}/entries/${entryId}/restore`, {}),
    onSuccess: () => invalidatePeriod(queryClient, periodId),
  });
}
