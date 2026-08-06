import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '../lib/api';

// Reads a column's live ENUM values off the schema itself (see
// server/routes/meta.js) instead of hand-duplicating them in the frontend --
// the two can't drift out of sync if there's only one copy.
export function useEnumValues(table: string, column: string) {
  return useQuery({
    queryKey: ['enum-values', table, column],
    queryFn: () => fetchJson<{ values: string[] }>(`/api/meta/enum-values?table=${table}&column=${column}`),
    staleTime: 60 * 60 * 1000,
  });
}
