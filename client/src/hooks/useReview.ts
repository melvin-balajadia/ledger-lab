import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, patchJson } from '../lib/api';
import type { ReviewItem, ReviewSource } from '../types';
import { PROJECT_ID } from './useProjectData';

export function useReviewItems() {
  return useQuery({
    queryKey: ['review', PROJECT_ID],
    queryFn: () => fetchJson<ReviewItem[]>(`/api/projects/${PROJECT_ID}/review`),
  });
}

// The three ledgers that carry a needs_review flag, and their API paths.
export const LEDGER_PATHS: Partial<Record<ReviewSource, string>> = {
  replenishment: 'replenishments',
  cash_advance: 'cash-advances',
  additional_payment: 'additional-payments',
};

// Clears the flag through the ledger's own PATCH, so it is validated and
// audited exactly like an edit. Everything is refetched afterwards: the
// Overview totals leave flagged replenishments out, so clearing one moves them.
export function useMarkReviewed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: ReviewItem) =>
      patchJson(`/api/projects/${PROJECT_ID}/${LEDGER_PATHS[item.source]}/${item.id}`, { needs_review: 0 }),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
