"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Modal } from "./Modal";
import {
  IconPenLine,
  IconTrash,
  IconSearch,
  IconChevronUp,
  IconChevronDown,
  IconChevronsUpDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconRefresh,
  IconDownload,
  IconFilter,
  IconX,
  IconEye,
  IconColumns,
  IconCheck,
  IconEllipsis,
  IconGrid,
  IconTable,
} from "./icons";

// ─── Types ────────────────────────────────────────────────────────────────

export type SortDirection = "asc" | "desc" | null;

export interface ColumnDef<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
  /**
   * Controls what input is rendered in the Filter panel for this column.
   * "text"   — plain text input (default)
   * "select" — dropdown; pair with filterOptions
   */
  filterType?: "text" | "select";
  /**
   * Only used when filterType === "select".
   * Each entry becomes an <option>; a blank "All …" option is prepended
   * automatically so the user can clear the filter.
   */
  filterOptions?: { label: string; value: string }[];
  hidden?: boolean;
  width?: string;
  // NOTE: render() is used for display only. exportToCSV always uses raw values
  // so that CSV output isn't polluted with JSX/icon markup.
  render?: (value: unknown, row: T) => React.ReactNode;
  align?: "left" | "center" | "right";
  cardTitle?: boolean;
  cardSubtitle?: boolean;
  hideInCard?: boolean;
}

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface FetchParams {
  page: number;
  perPage: number;
  search: string;
  sortKey: string | null;
  sortDir: SortDirection;
  filters: Record<string, string>;
  // FIX #2: expose the abort signal so callers can cancel in-flight requests
  signal?: AbortSignal;
}

export interface DataTableProps<T extends { [key: string]: unknown }> {
  columns: ColumnDef<T>[];
  fetchData: (
    params: FetchParams,
  ) => Promise<{ data: T[]; meta: PaginationMeta }>;
  rowKey: keyof T;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  onView?: (row: T) => void;
  extraActions?: (row: T) => React.ReactNode;
  selectable?: boolean;
  onSelectionChange?: (rows: T[]) => void;
  exportable?: boolean;
  title?: string;
  perPageOptions?: number[];
  searchDebounce?: number;
  searchPlaceholder?: string;
  // FIX: accept ReactNode so callers can render richer empty states
  emptyMessage?: React.ReactNode;
  refreshKey?: number;
  initialState?: {
    page?: number;
    perPage?: number;
    search?: string;
    sortKey?: string | null;
    sortDir?: SortDirection;
    filters?: Record<string, string>;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function get<T>(obj: T, path: string): unknown {
  return (path as string).split(".").reduce((acc: unknown, key: string) => {
    if (acc && typeof acc === "object")
      return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// NOTE: exportToCSV intentionally uses raw values (not col.render output)
// because rendered values may contain JSX elements, icons, or badges that
// would produce unreadable text in a CSV file.
function exportToCSV<T extends Record<string, unknown>>(
  rows: T[],
  columns: ColumnDef<T>[],
  filename: string,
) {
  const visibleCols = columns.filter((c) => !c.hidden);
  const header = visibleCols.map((c) => `"${c.label}"`).join(",");
  const csvRows = rows.map((row) =>
    visibleCols
      .map((c) => {
        const val = get(row, c.key as string);
        return `"${String(val ?? "").replace(/"/g, '""')}"`;
      })
      .join(","),
  );
  const csv = [header, ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// FIX #3: stable skeleton widths — avoids hydration mismatches in Next.js
// and prevents width from re-randomizing on every render.
const SKELETON_WIDTHS = ["60%", "75%", "55%", "80%", "65%", "70%"];

// Every paginated server route caps pageSize at 200 (see MAX_PAGE_SIZE in
// server/routes/*.js) -- exporting the full filtered set means paging
// through in chunks this size, not just grabbing the currently-loaded page.
const EXPORT_PAGE_SIZE = 200;

// ─── Sort Icon ──────────────────────────────────────────────────────────────

function SortIcon({ direction }: { direction: SortDirection }) {
  if (direction === "asc") return <IconChevronUp className="w-3.5 h-3.5" />;
  if (direction === "desc") return <IconChevronDown className="w-3.5 h-3.5" />;
  return <IconChevronsUpDown className="w-3.5 h-3.5 opacity-40" />;
}

// ─── Portal Dropdown Menu ───────────────────────────────────────────────────
// Rendered via createPortal so it escapes overflow:hidden/auto containers.

interface PortalDropdownProps {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}

function PortalDropdown({
  anchorRef,
  open,
  onClose,
  children,
  width: dropdownWidthProp = 160,
}: PortalDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({
    top: 0,
    left: 0,
    width: dropdownWidthProp,
  });

  useEffect(() => {
    if (!open || !anchorRef.current) return;

    const updateCoords = () => {
      const rect = anchorRef.current!.getBoundingClientRect();
      const dropdownWidth = dropdownWidthProp;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const estimatedHeight = 200;

      const spaceBelow = viewportHeight - rect.bottom;
      const top =
        spaceBelow < estimatedHeight && rect.top > estimatedHeight
          ? rect.top - estimatedHeight
          : rect.bottom + 4;

      const left =
        rect.right - dropdownWidth < 0 ? rect.left : rect.right - dropdownWidth;

      const clampedLeft = Math.max(
        8,
        Math.min(left, viewportWidth - dropdownWidth - 8),
      );

      setCoords({ top, left: clampedLeft, width: dropdownWidth });
    };

    updateCoords();

    window.addEventListener("scroll", updateCoords, true);
    window.addEventListener("resize", updateCoords);
    return () => {
      window.removeEventListener("scroll", updateCoords, true);
      window.removeEventListener("resize", updateCoords);
    };
  }, [open, anchorRef, dropdownWidthProp]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        width: coords.width,
        zIndex: 9999,
      }}
      className="rounded-md border border-rule bg-surface shadow-card py-1"
    >
      {children}
    </div>,
    document.body,
  );
}

// ─── Row Actions Dropdown ───────────────────────────────────────────────────

function RowActionsDropdown<T>({
  row,
  onView,
  onEdit,
  onDelete,
  extraActions,
}: {
  row: T;
  onView?: (row: T) => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  extraActions?: (row: T) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="relative flex items-center justify-center">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Row actions"
        className={`p-1.5 rounded-md transition-colors ${
          open ? "bg-surface-2 text-ink" : "text-ink-faint hover:bg-surface-2 hover:text-ink-muted"
        }`}
      >
        <IconEllipsis className="w-4 h-4" />
      </button>

      <PortalDropdown anchorRef={btnRef} open={open} onClose={close}>
        {onView && (
          <button
            type="button"
            onClick={() => {
              onView(row);
              close();
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-ink hover:bg-surface-2 transition-colors"
          >
            <IconEye className="w-3.5 h-3.5 text-ink-faint shrink-0" />
            View
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={() => {
              onEdit(row);
              close();
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-ink hover:bg-surface-2 transition-colors"
          >
            <IconPenLine className="w-3.5 h-3.5 text-ink-faint shrink-0" />
            Edit
          </button>
        )}
        {onDelete && (
          <>
            {(onView || onEdit) && <div className="my-1 border-t border-rule" />}
            <button
              type="button"
              onClick={() => {
                onDelete(row);
                close();
              }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-danger hover:bg-danger-soft transition-colors"
            >
              <IconTrash className="w-3.5 h-3.5 shrink-0" />
              Delete
            </button>
          </>
        )}
        {extraActions?.(row)}
      </PortalDropdown>
    </div>
  );
}

// ─── Data Card ──────────────────────────────────────────────────────────────

function DataCard<T extends { [key: string]: unknown }>({
  row,
  columns,
  onView,
  onEdit,
  onDelete,
  extraActions,
  selectable,
  isSelected,
  onToggleSelect,
}: {
  row: T;
  columns: ColumnDef<T>[];
  onView?: (row: T) => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  extraActions?: (row: T) => React.ReactNode;
  selectable?: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const visibleCols = columns.filter((c) => !c.hidden);
  const titleCol = visibleCols.find((c) => c.cardTitle) ?? visibleCols[0];
  const subtitleCol = visibleCols.find((c) => c.cardSubtitle) ?? visibleCols[1];
  const bodyFields = visibleCols.filter(
    (c) =>
      c.key !== titleCol?.key && c.key !== subtitleCol?.key && !c.hideInCard,
  );
  const hasActions = onView || onEdit || onDelete || extraActions;
  const titleVal = titleCol ? get(row, titleCol.key as string) : null;
  const subtitleVal = subtitleCol ? get(row, subtitleCol.key as string) : null;

  return (
    // FIX #4: clicking the card body triggers onView (row-click-to-view UX)
    <div
      role={onView ? "button" : undefined}
      tabIndex={onView ? 0 : undefined}
      onClick={onView ? () => onView(row) : undefined}
      onKeyDown={
        onView
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onView(row);
            }
          : undefined
      }
      className={`flex flex-col bg-surface rounded-md border transition-all duration-100 ${
        onView ? "cursor-pointer" : ""
      } ${
        isSelected
          ? "border-accent ring-2 ring-accent-soft"
          : "border-rule hover:border-rule-strong hover:shadow-card"
      }`}
    >
      <div className="flex items-start gap-3 px-4 pt-4 pb-3.5">
        {selectable && (
          <input
            type="checkbox"
            checked={isSelected}
            // Stop propagation so the checkbox click doesn't also fire onView
            onClick={(e) => e.stopPropagation()}
            onChange={onToggleSelect}
            className="mt-0.5 shrink-0 rounded border-rule-strong text-accent focus:ring-accent cursor-pointer w-4 h-4"
          />
        )}
        <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink leading-tight truncate">
              {titleCol?.render
                ? titleCol.render(titleVal, row)
                : String(titleVal ?? "—")}
            </p>
            {subtitleCol && (
              <p className="mt-0.5 text-xs text-ink-muted truncate">
                {subtitleCol.render
                  ? subtitleCol.render(subtitleVal, row)
                  : String(subtitleVal ?? "—")}
              </p>
            )}
          </div>
          {hasActions && (
            // Stop propagation so the actions menu doesn't also fire onView
            <div
              className="shrink-0 -mt-0.5 -mr-1"
              onClick={(e) => e.stopPropagation()}
            >
              <RowActionsDropdown
                row={row}
                onView={onView}
                onEdit={onEdit}
                onDelete={onDelete}
                extraActions={extraActions}
              />
            </div>
          )}
        </div>
      </div>

      {bodyFields.length > 0 && (
        <div className="px-4 pt-3 pb-4 border-t border-rule grid grid-cols-2 gap-x-4 gap-y-3">
          {bodyFields.map((col) => {
            const raw = get(row, col.key as string);
            return (
              <div key={col.key as string} className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint mb-0.5 leading-none">
                  {col.label}
                </p>
                <p className="text-xs text-ink-muted truncate">
                  {col.render ? col.render(raw, row) : String(raw ?? "—")}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Skeleton Card ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-surface rounded-md border border-rule animate-pulse">
      <div className="px-4 pt-4 pb-3.5 flex flex-col gap-2">
        <div className="h-4 bg-rule rounded w-2/5" />
        <div className="h-3 bg-surface-2 rounded w-1/3" />
      </div>
      <div className="px-4 pt-3 pb-4 border-t border-rule grid grid-cols-2 gap-x-4 gap-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <div className="h-2 bg-surface-2 rounded w-1/2 mb-1.5" />
            <div className="h-3 bg-rule rounded w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pagination Button ──────────────────────────────────────────────────────

function PagBtn({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-7 h-7 flex items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

// ─── View Toggle ────────────────────────────────────────────────────────────

function ViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: "auto" | "table" | "cards";
  onChange: (v: "auto" | "table" | "cards") => void;
}) {
  return (
    <div className="flex items-center rounded-md border border-rule overflow-hidden bg-surface">
      <button
        type="button"
        title="Card view"
        onClick={() => onChange(viewMode === "cards" ? "auto" : "cards")}
        className={`px-2 py-1.5 flex items-center justify-center transition-colors ${
          viewMode === "cards" ? "bg-accent text-white" : "text-ink-muted hover:bg-surface-2"
        }`}
      >
        <IconGrid className="w-3.5 h-3.5" />
      </button>
      <div className="w-px h-4 bg-rule" />
      <button
        type="button"
        title="Table view"
        onClick={() => onChange(viewMode === "table" ? "auto" : "table")}
        className={`px-2 py-1.5 flex items-center justify-center transition-colors ${
          viewMode === "table" ? "bg-accent text-white" : "text-ink-muted hover:bg-surface-2"
        }`}
      >
        <IconTable className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Main DataTable Component ──────────────────────────────────────────────

export function DataTable<T extends { [key: string]: unknown }>({
  columns: initialColumns,
  fetchData,
  rowKey,
  onEdit,
  onDelete,
  onView,
  extraActions,
  selectable = false,
  onSelectionChange,
  exportable = false,
  title,
  perPageOptions = [10, 25, 50, 100],
  searchDebounce = 350,
  searchPlaceholder = "Search…",
  emptyMessage = "No records found.",
  refreshKey,
  initialState, // ← add this
}: DataTableProps<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    page: 1,
    perPage: perPageOptions[0],
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState(initialState?.search ?? "");
  const debouncedSearch = useDebounce(search, searchDebounce);
  const [sortKey, setSortKey] = useState<string | null>(
    initialState?.sortKey ?? null,
  );
  const [sortDir, setSortDir] = useState<SortDirection>(
    initialState?.sortDir ?? null,
  );
  const [page, setPage] = useState(() => {
    const p = initialState?.page ?? 1;
    // Guard against NaN / negative values from a tampered URL
    return Number.isFinite(p) && p > 0 ? Math.floor(p) : 1;
  });
  const [perPage, setPerPage] = useState(() => {
    const requested = initialState?.perPage ?? perPageOptions[0];
    // Only honour values that are actually in the options list so the
    // <select> always has a matching option and the API is not hammered
    // with an arbitrary page size from a hand-crafted URL.
    return perPageOptions.includes(requested) ? requested : perPageOptions[0];
  });
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    // Strip empty strings so a blank URL param doesn't become an active filter
    const raw = initialState?.filters ?? {};
    return Object.fromEntries(
      Object.entries(raw).filter(
        ([, v]) => typeof v === "string" && v.trim() !== "",
      ),
    );
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [pendingFilters, setPendingFilters] = useState<Record<string, string>>(
    () => {
      const raw = initialState?.filters ?? {};
      return Object.fromEntries(
        Object.entries(raw).filter(
          ([, v]) => typeof v === "string" && v.trim() !== "",
        ),
      );
    },
  );
  const [selected, setSelected] = useState<Set<unknown>>(new Set());
  const [columns, setColumns] = useState(initialColumns);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"auto" | "table" | "cards">("auto");
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportSelectedKeys, setExportSelectedKeys] = useState<Set<string>>(
    new Set(),
  );
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // Tracks whether this is the initial mount. The page-reset effect must not
  // fire on mount because initialState may have already seeded page > 1 from
  // the URL — resetting it would discard the restored state immediately.
  const isMountedRef = useRef(false);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const colPickerBtnRef = useRef<HTMLButtonElement>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    // FIX #2: abort the previous request AND pass the new signal to fetchData
    // so callers can use it in fetch(url, { signal }) or axios cancelToken.
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    setLoading(true);
    setError(null);
    try {
      const result = await fetchData({
        page,
        perPage,
        search: debouncedSearch,
        sortKey,
        sortDir,
        filters,
        signal, // ← passed through so callers can cancel the actual HTTP request
      });
      // Guard: if the component unmounted or a newer request fired, ignore stale result
      if (signal.aborted) return;
      setRows(result.data);
      setMeta(result.meta);
      setSelected(new Set());
    } catch {
      // A stale/superseded request was cancelled — its rejection carries no
      // useful information and must not overwrite state from the request
      // that replaced it. Checking the signal itself (rather than matching
      // the error's `name`) works regardless of HTTP client: axios throws
      // its own CanceledError on an aborted signal, not a native AbortError.
      if (signal.aborted) return;
      setError("Failed to load data. Please try again.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [page, perPage, debouncedSearch, sortKey, sortDir, filters, fetchData]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Reset to page 1 when the user actively changes search/filters/perPage,
  // but NOT on the initial mount — that would discard the URL-restored page.
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    setPage(1);
  }, [debouncedSearch, filters, perPage]);

  const handleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") setSortDir("desc");
    else {
      setSortKey(null);
      setSortDir(null);
    }
    setPage(1);
  };

  const toggleRow = (id: unknown) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    onSelectionChange?.(rows.filter((r) => next.has(r[rowKey])));
  };

  const toggleAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
      onSelectionChange?.([]);
    } else {
      const next = new Set(rows.map((r) => r[rowKey]));
      setSelected(next);
      onSelectionChange?.(rows);
    }
  };

  const toggleColumn = (key: string) =>
    setColumns((prev) =>
      prev.map((c) => (c.key === key ? { ...c, hidden: !c.hidden } : c)),
    );

  const openExportModal = () => {
    setExportSelectedKeys(
      new Set(
        columns.filter((c) => !c.hidden).map((c) => c.key as string),
      ),
    );
    setExportError(null);
    setExportModalOpen(true);
  };

  const toggleExportColumn = (key: string) =>
    setExportSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Pages through every row matching the current search/filter/sort --
  // `rows` in state is only the currently-displayed page, so exporting that
  // silently truncates to one page's worth (e.g. 25 of 256 records).
  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      let allRows: T[] = [];
      let exportPage = 1;
      for (;;) {
        const result = await fetchData({
          page: exportPage,
          perPage: EXPORT_PAGE_SIZE,
          search: debouncedSearch,
          sortKey,
          sortDir,
          filters,
        });
        allRows = allRows.concat(result.data);
        if (result.data.length === 0 || allRows.length >= result.meta.total) {
          break;
        }
        exportPage++;
      }
      const exportColumns = columns.map((c) => ({
        ...c,
        hidden: !exportSelectedKeys.has(c.key as string),
      }));
      exportToCSV(allRows, exportColumns, title ?? "export");
      setExportModalOpen(false);
    } catch {
      setExportError("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const applyFilters = () => {
    setFilters(pendingFilters);
    setFilterOpen(false);
    setPage(1);
  };
  const clearFilters = () => {
    setFilters({});
    setPendingFilters({});
    setFilterOpen(false);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const visibleColumns = columns.filter((c) => !c.hidden);
  const hasActions = !!(onEdit || onDelete || onView || extraActions);
  const filterableColumns = columns.filter((c) => c.filterable);

  const canPrev = page > 1;
  const canNext = page < meta.totalPages;
  const pageNumbers = Array.from({ length: meta.totalPages }, (_, i) => i + 1);
  const displayedPages = pageNumbers.filter(
    (p) => p === 1 || p === meta.totalPages || Math.abs(p - page) <= 1,
  );

  const isCards = viewMode === "cards";
  const isTable = viewMode === "table";
  const isAuto = viewMode === "auto";

  // ── Empty state ──────────────────────────────────────────────────────────
  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-ink-faint text-sm">
      <IconSearch className="w-8 h-8 opacity-25" />
      <div>{emptyMessage}</div>
      {(search || activeFilterCount > 0) && (
        <button
          type="button"
          onClick={() => {
            setSearch("");
            clearFilters();
          }}
          className="text-xs text-accent hover:underline"
        >
          Clear search &amp; filters
        </button>
      )}
    </div>
  );

  // ── Card content ─────────────────────────────────────────────────────────
  const renderCardContent = (forceGrid: boolean) => {
    const gridClass = forceGrid
      ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
      : "flex flex-col gap-2.5";

    if (loading && rows.length === 0) {
      return (
        <div className={`p-3 ${gridClass}`}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          {forceGrid && <SkeletonCard />}
        </div>
      );
    }
    if (rows.length === 0) {
      return <EmptyState />;
    }
    return (
      <>
        {selectable && (
          <div className="flex items-center gap-2.5 px-4 pt-3 pb-0">
            <input
              type="checkbox"
              checked={rows.length > 0 && selected.size === rows.length}
              ref={(el) => {
                if (el)
                  el.indeterminate =
                    selected.size > 0 && selected.size < rows.length;
              }}
              onChange={toggleAll}
              className="rounded border-rule-strong text-accent focus:ring-accent cursor-pointer w-4 h-4"
            />
            <span className="text-xs text-ink-muted select-none">
              Select all
            </span>
          </div>
        )}
        <div
          className={`p-3 ${loading ? "opacity-60 pointer-events-none" : ""} ${gridClass}`}
        >
          {rows.map((row) => {
            const id = row[rowKey];
            return (
              <DataCard
                key={String(id)}
                row={row}
                columns={visibleColumns}
                onView={onView}
                onEdit={onEdit}
                onDelete={onDelete}
                extraActions={extraActions}
                selectable={selectable}
                isSelected={selected.has(id)}
                onToggleSelect={() => toggleRow(id)}
              />
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div className="flex flex-col rounded-md border border-rule bg-surface shadow-card overflow-hidden">
      {/* ── TOOLBAR ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-rule bg-surface-2">
        {/* Left */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {title && (
            <h2 className="text-sm font-semibold text-ink shrink-0 hidden sm:block">
              {title}
            </h2>
          )}
          <div className="relative flex-1 max-w-xs">
            <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint w-3.5 h-3.5 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-sm border border-rule-strong bg-surface text-ink placeholder-ink-faint focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-muted"
              >
                <IconX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* View toggle */}
          <ViewToggle viewMode={viewMode} onChange={setViewMode} />

          {/* Filter */}
          {filterableColumns.length > 0 && (
            <div>
              <button
                type="button"
                ref={filterBtnRef}
                onClick={() => {
                  setFilterOpen((o) => !o);
                  setColPickerOpen(false);
                  setPendingFilters(filters);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-sm border transition-colors font-medium ${
                  activeFilterCount > 0
                    ? "border-accent text-accent bg-accent-soft"
                    : "border-rule-strong text-ink-muted bg-surface hover:bg-surface-2"
                }`}
              >
                <IconFilter className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Filter</span>
                {activeFilterCount > 0 && (
                  <span className="bg-accent text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center leading-none">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <PortalDropdown
                anchorRef={filterBtnRef}
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                width={256}
              >
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink">
                      Filters
                    </span>
                    <button
                      type="button"
                      onClick={() => setFilterOpen(false)}
                      className="text-ink-faint hover:text-ink-muted"
                    >
                      <IconX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {filterableColumns.map((col) => (
                    <div
                      key={col.key as string}
                      className="flex flex-col gap-1"
                    >
                      <label className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider">
                        {col.label}
                      </label>
                      {col.filterType === "select" ? (
                        <select
                          value={pendingFilters[col.key as string] ?? ""}
                          onChange={(e) =>
                            setPendingFilters((p) => ({
                              ...p,
                              [col.key as string]: e.target.value,
                            }))
                          }
                          className="px-2.5 py-1.5 text-xs rounded-sm border border-rule-strong bg-surface-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
                        >
                          <option value="">All {col.label}s</option>
                          {col.filterOptions?.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={pendingFilters[col.key as string] ?? ""}
                          onChange={(e) =>
                            setPendingFilters((p) => ({
                              ...p,
                              [col.key as string]: e.target.value,
                            }))
                          }
                          placeholder={`Filter by ${col.label.toLowerCase()}…`}
                          className="px-2.5 py-1.5 text-xs rounded-sm border border-rule-strong bg-surface-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
                        />
                      )}
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="flex-1 py-1.5 text-xs rounded-sm border border-rule-strong text-ink-muted hover:bg-surface-2 font-medium transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={applyFilters}
                      className="flex-1 py-1.5 text-xs rounded-sm bg-accent hover:bg-accent-strong text-white font-medium transition-colors"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </PortalDropdown>
            </div>
          )}

          {/* Column picker — shown in both table and card views */}
          {(isTable || isAuto || isCards) && (
            <div>
              <button
                type="button"
                ref={colPickerBtnRef}
                onClick={() => {
                  setColPickerOpen((o) => !o);
                  setFilterOpen(false);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-sm border border-rule-strong text-ink-muted bg-surface hover:bg-surface-2 transition-colors font-medium"
              >
                <IconColumns className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Columns</span>
              </button>
              <PortalDropdown
                anchorRef={colPickerBtnRef}
                open={colPickerOpen}
                onClose={() => setColPickerOpen(false)}
                width={192}
              >
                <div className="p-3 flex flex-col gap-0.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-ink">
                      Visible columns
                    </span>
                    <button
                      type="button"
                      onClick={() => setColPickerOpen(false)}
                      className="text-ink-faint hover:text-ink-muted"
                    >
                      <IconX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {columns.map((col) => (
                    <button
                      type="button"
                      key={col.key as string}
                      onClick={() => toggleColumn(col.key as string)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-surface-2 transition-colors text-xs text-ink"
                    >
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${!col.hidden ? "bg-accent border-accent text-white" : "border-rule-strong"}`}
                      >
                        {!col.hidden && <IconCheck className="w-2.5 h-2.5" />}
                      </span>
                      {col.label}
                    </button>
                  ))}
                </div>
              </PortalDropdown>
            </div>
          )}

          {/* Refresh */}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            title="Refresh"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-sm border border-rule-strong text-ink-muted bg-surface hover:bg-surface-2 transition-colors font-medium disabled:opacity-50"
          >
            <IconRefresh
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Export */}
          {exportable && (
            <button
              type="button"
              onClick={openExportModal}
              disabled={meta.total === 0}
              title="Export CSV"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-sm border border-rule-strong text-ink-muted bg-surface hover:bg-surface-2 transition-colors font-medium disabled:opacity-50"
            >
              <IconDownload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Selection banner ── */}
      {selectable && selected.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-accent-soft border-b border-rule text-xs text-accent font-medium">
          <span>
            {selected.size} row{selected.size > 1 ? "s" : ""} selected
          </span>
          <button
            type="button"
            onClick={() => {
              setSelected(new Set());
              onSelectionChange?.([]);
            }}
            className="underline hover:no-underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-danger-soft border-b border-rule text-xs text-danger">
          <IconX className="w-3.5 h-3.5 shrink-0" />
          {error}
          <button
            type="button"
            onClick={load}
            className="ml-auto underline hover:no-underline font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── CARD VIEW ─────────────────────────────────────────────────────── */}
      <div
        className={isCards ? "block" : isTable ? "hidden" : "block sm:hidden"}
      >
        {renderCardContent(isCards)}
      </div>

      {/* ── TABLE VIEW ────────────────────────────────────────────────────── */}
      <div
        className={`${isTable ? "block" : isCards ? "hidden" : "hidden sm:block"} overflow-x-auto`}
      >
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase bg-surface-2 text-ink-faint border-b border-rule">
              {selectable && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    ref={(el) => {
                      if (el)
                        el.indeterminate =
                          selected.size > 0 && selected.size < rows.length;
                    }}
                    onChange={toggleAll}
                    className="rounded border-rule-strong text-accent focus:ring-accent cursor-pointer"
                  />
                </th>
              )}
              {visibleColumns.map((col) => (
                <th
                  key={col.key as string}
                  style={col.width ? { width: col.width } : undefined}
                  className={`px-4 py-3 font-semibold tracking-wide whitespace-nowrap ${
                    col.align === "center"
                      ? "text-center"
                      : col.align === "right"
                        ? "text-right"
                        : "text-left"
                  }`}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => handleSort(col.key as string)}
                      className="inline-flex items-center gap-1 hover:text-ink-muted transition-colors"
                    >
                      {col.label}
                      <span
                        className={sortKey === col.key ? "text-accent" : ""}
                      >
                        <SortIcon
                          direction={sortKey === col.key ? sortDir : null}
                        />
                      </span>
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
              {hasActions && (
                <th className="px-4 py-3 text-center w-14">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {loading && rows.length === 0 ? (
              // FIX #3: stable widths via lookup array — no Math.random()
              Array.from({ length: Math.min(perPage, 6) }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {selectable && (
                    <td className="px-4 py-3">
                      <div className="h-4 w-4 bg-rule rounded" />
                    </td>
                  )}
                  {visibleColumns.map((col, ci) => (
                    <td key={col.key as string} className="px-4 py-3">
                      <div
                        className="h-3.5 bg-rule rounded"
                        style={{
                          width:
                            SKELETON_WIDTHS[(i + ci) % SKELETON_WIDTHS.length],
                        }}
                      />
                    </td>
                  ))}
                  {hasActions && (
                    <td className="px-4 py-3">
                      <div className="h-4 w-5 bg-rule rounded mx-auto" />
                    </td>
                  )}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={
                    visibleColumns.length +
                    (selectable ? 1 : 0) +
                    (hasActions ? 1 : 0)
                  }
                >
                  <EmptyState />
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const id = row[rowKey];
                const isSelected = selected.has(id);
                return (
                  // FIX #4: clicking a row triggers onView (cursor changes to pointer when onView is set)
                  <tr
                    key={String(id)}
                    onClick={() => onView?.(row)}
                    className={`transition-colors ${onView ? "cursor-pointer" : ""} ${loading ? "opacity-50" : ""} ${
                      isSelected ? "bg-accent-soft" : "hover:bg-surface-2"
                    }`}
                  >
                    {selectable && (
                      <td
                        className="px-4 py-3"
                        // Stop propagation so the checkbox click doesn't also fire onView
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(id)}
                          className="rounded border-rule-strong text-accent focus:ring-accent cursor-pointer"
                        />
                      </td>
                    )}
                    {visibleColumns.map((col) => {
                      const raw = get(row, col.key as string);
                      return (
                        <td
                          key={col.key as string}
                          className={`px-4 py-3 text-ink-muted whitespace-nowrap text-sm ${
                            col.align === "center"
                              ? "text-center"
                              : col.align === "right"
                                ? "text-right"
                                : "text-left"
                          }`}
                        >
                          {col.render
                            ? col.render(raw, row)
                            : String(raw ?? "—")}
                        </td>
                      );
                    })}
                    {hasActions && (
                      // Stop propagation so actions menu doesn't also fire onView
                      <td
                        className="px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <RowActionsDropdown
                          row={row}
                          onView={onView}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          extraActions={extraActions}
                        />
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── FOOTER / PAGINATION ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-t border-rule bg-surface-2 text-xs text-ink-muted">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label className="hidden sm:inline">Per page:</label>
            <select
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
              className="rounded-sm border border-rule-strong bg-surface text-ink px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
            >
              {perPageOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <span>
            {meta.total === 0
              ? "No results"
              : `${(page - 1) * perPage + 1}–${Math.min(page * perPage, meta.total)} of ${meta.total.toLocaleString()}`}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <PagBtn
            onClick={() => setPage(1)}
            disabled={!canPrev}
            title="First page"
          >
            <IconChevronsLeft className="w-3.5 h-3.5" />
          </PagBtn>
          <PagBtn
            onClick={() => setPage((p) => p - 1)}
            disabled={!canPrev}
            title="Prev"
          >
            <IconChevronLeft className="w-3.5 h-3.5" />
          </PagBtn>

          {/* FIX #1: key on React.Fragment, not on inner elements — eliminates React key warning */}
          {displayedPages.map((p, i, arr) => (
            <React.Fragment key={p}>
              {i > 0 && arr[i - 1] !== p - 1 && (
                <span className="px-1 text-ink-faint select-none">…</span>
              )}
              <button
                type="button"
                onClick={() => setPage(p)}
                className={`min-w-7 h-7 px-2 rounded-md text-xs font-medium transition-colors ${
                  p === page ? "bg-accent text-white" : "text-ink-muted hover:bg-surface-2"
                }`}
              >
                {p}
              </button>
            </React.Fragment>
          ))}

          <PagBtn
            onClick={() => setPage((p) => p + 1)}
            disabled={!canNext}
            title="Next"
          >
            <IconChevronRight className="w-3.5 h-3.5" />
          </PagBtn>
          <PagBtn
            onClick={() => setPage(meta.totalPages)}
            disabled={!canNext}
            title="Last page"
          >
            <IconChevronsRight className="w-3.5 h-3.5" />
          </PagBtn>
        </div>
      </div>

      {exportModalOpen && (
        <Modal
          title="Columns to export"
          onClose={() => (!exporting ? setExportModalOpen(false) : undefined)}
        >
          <div className="flex flex-col gap-3">
            {exportError && (
              <p className="rounded-sm border border-danger bg-danger-soft px-3 py-2 text-xs text-danger">
                {exportError}
              </p>
            )}
            <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto border-y border-rule py-2">
              {columns.map((col) => {
                const key = col.key as string;
                const checked = exportSelectedKeys.has(key);
                return (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2.5 rounded-sm px-1 py-1.5 text-sm text-ink hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleExportColumn(key)}
                      className="h-4 w-4 rounded border-rule-strong text-accent focus:ring-accent"
                    />
                    {col.label}
                  </label>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  setExportSelectedKeys(
                    new Set(columns.map((c) => c.key as string)),
                  )
                }
                disabled={exporting}
                className="rounded-sm border border-rule-strong px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2 disabled:opacity-50"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting || exportSelectedKeys.size === 0}
                className="rounded-sm bg-accent px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
              >
                {exporting ? "Exporting…" : `Export (${meta.total.toLocaleString()})`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default DataTable;
