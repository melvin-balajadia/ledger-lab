import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '../lib/api';
import type { CostBreakdown, CostTrendPoint, DashboardAlert, RetentionSummary, TopSupplier, VatSummary, WeeklyBurnPoint } from '../types';
import { PROJECT_ID } from './useProjectData';

export function useCostBreakdown() {
  return useQuery({
    queryKey: ['cost-breakdown', PROJECT_ID],
    queryFn: () => fetchJson<CostBreakdown>(`/api/projects/${PROJECT_ID}/cost-breakdown`),
  });
}

export function useCostTrend(months = 6) {
  return useQuery({
    queryKey: ['cost-trend', PROJECT_ID, months],
    queryFn: () => fetchJson<CostTrendPoint[]>(`/api/projects/${PROJECT_ID}/cost-trend?months=${months}`),
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: ['alerts', PROJECT_ID],
    queryFn: () => fetchJson<DashboardAlert[]>(`/api/projects/${PROJECT_ID}/alerts`),
  });
}

export function useRetentionSummary() {
  return useQuery({
    queryKey: ['retention', PROJECT_ID],
    queryFn: () => fetchJson<RetentionSummary>(`/api/projects/${PROJECT_ID}/retention`),
  });
}

export function useVatSummary() {
  return useQuery({
    queryKey: ['vat-summary', PROJECT_ID],
    queryFn: () => fetchJson<VatSummary>(`/api/projects/${PROJECT_ID}/vat-summary`),
  });
}

export function useTopSuppliers(limit = 10) {
  return useQuery({
    queryKey: ['top-suppliers', PROJECT_ID, limit],
    queryFn: () => fetchJson<TopSupplier[]>(`/api/projects/${PROJECT_ID}/top-suppliers?limit=${limit}`),
  });
}

export function useWeeklyBurn(weeks = 12) {
  return useQuery({
    queryKey: ['weekly-burn', PROJECT_ID, weeks],
    queryFn: () => fetchJson<WeeklyBurnPoint[]>(`/api/projects/${PROJECT_ID}/weekly-burn?weeks=${weeks}`),
  });
}
