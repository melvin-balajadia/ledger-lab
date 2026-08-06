import type { FetchParams, PaginationMeta } from '../components/DataTable';

// For lists that are already small and fully fetched (a period's own
// entries, a worker's own entries) -- filters/sorts/slices in memory into
// DataTable's {data, meta} shape, so they get the same UI (search, sort,
// card/table toggle, export) without a new paginated endpoint.
export function clientPaginate<T extends Record<string, unknown>>(
  rows: T[],
  { page, perPage, search, sortKey, sortDir }: FetchParams,
  searchFields: (keyof T)[] = [],
): { data: T[]; meta: PaginationMeta } {
  let filtered = rows;

  if (search && searchFields.length > 0) {
    const needle = search.toLowerCase();
    filtered = filtered.filter((row) =>
      searchFields.some((field) => String(row[field] ?? '').toLowerCase().includes(needle)),
    );
  }

  if (sortKey) {
    const dir = sortDir === 'desc' ? -1 : 1;
    filtered = [...filtered].sort((a, b) => {
      const av = a[sortKey as keyof T];
      const bv = b[sortKey as keyof T];
      const an = Number(av);
      const bn = Number(bv);
      if (av != null && bv != null && !Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * dir;
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
    });
  }

  const total = filtered.length;
  const start = (page - 1) * perPage;
  const data = filtered.slice(start, start + perPage);

  return {
    data,
    meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
  };
}
