import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, patchJson, postJson } from '../lib/api';
import type { Supplier } from '../types';

export function useSuppliers(q: string) {
  return useQuery({
    queryKey: ['suppliers', q],
    queryFn: () => fetchJson<Supplier[]>(`/api/suppliers?q=${encodeURIComponent(q)}`),
    enabled: q.length > 0,
    staleTime: 60 * 1000,
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; tin?: string | null }) => postJson<Supplier>('/api/suppliers', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; name?: string; tin?: string | null; is_active?: 0 | 1 }) =>
      patchJson<Supplier>(`/api/suppliers/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}
