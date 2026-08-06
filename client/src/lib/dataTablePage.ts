import type { PaginationMeta } from '../components/DataTable';

// Maps this app's existing {rows, page, pageSize, total} list-response
// envelope (used by both /replenishments and /purchase-orders) onto
// DataTable's {page, perPage, total, totalPages} meta shape.
export function toPageMeta(json: { page: number; pageSize: number; total: number }): PaginationMeta {
  return {
    page: json.page,
    perPage: json.pageSize,
    total: json.total,
    totalPages: Math.max(1, Math.ceil(json.total / json.pageSize)),
  };
}
