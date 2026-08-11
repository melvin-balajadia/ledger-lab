// Persists DataTable state (page, perPage, search, sort, filters) in two layers:
//
//   1. sessionStorage — survives page refresh, cleared on tab/browser close.
//                        Keyed by page prefix only -- this app has exactly
//                        one local user (see CLAUDE.md), so there's no
//                        per-user isolation to key against.
//
//   2. URL params      — keeps the address bar bookmarkable while the user
//                        is on the page.
//
// Priority on restore: sessionStorage > URL params > defaults
//
// Cleared on logout: call clearAllTableStates() in the logout handler.

import { useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import type { FetchParams, SortDirection } from "../components/DataTable";

// ─── Public helpers — call from the logout handler ─────────────────────────

/** Clear saved state for one specific table. */
export function clearTableState(prefix: string) {
  sessionStorage.removeItem(`tbl_${prefix}`);
}

/** Clear ALL saved table states (call on logout). */
export function clearAllTableStates() {
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith("tbl_")) keysToRemove.push(key);
  }
  keysToRemove.forEach((k) => sessionStorage.removeItem(k));
}

// ─── Internal storage helpers ───────────────────────────────────────────────

interface StoredState {
  page: number;
  perPage: number;
  search: string;
  sortKey: string | null;
  sortDir: SortDirection;
  filters: Record<string, string>;
}

function storageKey(prefix: string) {
  return `tbl_${prefix}`;
}

function readStorage(prefix: string): StoredState | null {
  try {
    const raw = sessionStorage.getItem(storageKey(prefix));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    // Guard: page must be a positive integer
    if (!Number.isFinite(parsed.page) || parsed.page < 1) parsed.page = 1;
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(prefix: string, state: StoredState) {
  try {
    sessionStorage.setItem(storageKey(prefix), JSON.stringify(state));
  } catch {
    // quota exceeded — silently ignore
  }
}

// ─── URL param helpers ──────────────────────────────────────────────────────

// Every URL key -- not just filters -- is namespaced by table prefix. Two
// DataTables can share one route (Payroll's "By Week"/"By Worker" tabs both
// live at /payroll), so an unprefixed "page"/"sort" would have one table's
// pagination leak into the other's on a fresh load with no sessionStorage
// yet (e.g. a bookmarked/shared URL).
function urlKey(prefix: string, name: string) {
  return `${prefix}_${name}`;
}

function filterUrlKey(prefix: string, key: string) {
  // e.g. prefix="repl", key="status" -> "repl_f_status"
  return urlKey(prefix, `f_${key}`);
}

function readUrlParams(
  searchParams: URLSearchParams,
  prefix: string,
  filterKeys: string[],
  defaultPerPage: number,
): StoredState {
  const page = Math.max(1, Number(searchParams.get(urlKey(prefix, "page"))) || 1);
  const perPage = Math.max(
    1,
    Number(searchParams.get(urlKey(prefix, "per_page"))) || defaultPerPage,
  );
  const search = searchParams.get(urlKey(prefix, "q")) ?? "";
  const sortKey = searchParams.get(urlKey(prefix, "sort")) ?? null;
  const rawDir = searchParams.get(urlKey(prefix, "dir"));
  const sortDir: SortDirection =
    rawDir === "asc" || rawDir === "desc" ? rawDir : null;

  const filters: Record<string, string> = {};
  filterKeys.forEach((key) => {
    const val = searchParams.get(filterUrlKey(prefix, key));
    if (val) filters[key] = val;
  });

  return { page, perPage, search, sortKey, sortDir, filters };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseTableUrlStateOptions {
  /** Short unique identifier for this table, e.g. "repl", "po", "ca". */
  prefix: string;
  /** The `key` values of all filterable columns. */
  filterKeys: string[];
  defaultPerPage?: number;
}

export interface UseTableUrlStateReturn {
  /**
   * Call at the top of your fetchData callback.
   * Writes the full params to sessionStorage + URL on every table interaction.
   */
  syncToUrl: (params: FetchParams) => void;
  /**
   * Call ONCE when passing initialState to DataTable.
   * Reads sessionStorage first, then URL params, then returns defaults.
   * DataTable only consumes initialState on mount, so call this in the
   * JSX directly: initialState={buildFetchParams()}
   */
  buildFetchParams: () => Partial<FetchParams>;
}

export function useTableUrlState({
  prefix,
  filterKeys,
  defaultPerPage = 10,
}: UseTableUrlStateOptions): UseTableUrlStateReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  // Latest-value refs so syncToUrl/buildFetchParams stay referentially
  // stable (empty dep arrays below) without ever reading a stale value --
  // assigned directly during render, NOT in a useEffect. An effect-based
  // mirror lags one commit behind the render that changed the source value,
  // which is invisible for props that never change after mount but silently
  // drops data on the one render where a value legitimately does change.
  const prefixRef = useRef(prefix);
  prefixRef.current = prefix;
  const filterKeysRef = useRef(filterKeys);
  filterKeysRef.current = filterKeys;
  const defaultPerPageRef = useRef(defaultPerPage);
  defaultPerPageRef.current = defaultPerPage;
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  const setSearchParamsRef = useRef(setSearchParams);
  setSearchParamsRef.current = setSearchParams;

  // ── buildFetchParams — stable, reads storage → URL → defaults ──────────
  const buildFetchParams = useCallback((): Partial<FetchParams> => {
    const pfx = prefixRef.current;
    const fKeys = filterKeysRef.current;
    const defPerPage = defaultPerPageRef.current;

    // 1. sessionStorage wins (survives page refresh)
    const stored = readStorage(pfx);
    if (stored) {
      return {
        page: stored.page,
        perPage: stored.perPage,
        search: stored.search,
        sortKey: stored.sortKey,
        sortDir: stored.sortDir,
        filters: stored.filters,
      };
    }

    // 2. URL params (handles bookmarks / shared links)
    const fromUrl = readUrlParams(
      searchParamsRef.current,
      pfx,
      fKeys,
      defPerPage,
    );
    return {
      page: fromUrl.page,
      perPage: fromUrl.perPage,
      search: fromUrl.search,
      sortKey: fromUrl.sortKey,
      sortDir: fromUrl.sortDir,
      filters: fromUrl.filters,
    };
  }, []); // ← intentionally empty — reads everything via refs

  // ── syncToUrl — called by fetchData on every table state change ────────
  const syncToUrl = useCallback((params: FetchParams) => {
    const pfx = prefixRef.current;
    const fKeys = filterKeysRef.current;
    const defPerPage = defaultPerPageRef.current;
    const { page, perPage, search, sortKey, sortDir, filters } = params;

    // 1. Persist to sessionStorage
    writeStorage(pfx, { page, perPage, search, sortKey, sortDir, filters });

    // 2. Mirror to URL (replace so back button isn't polluted)
    setSearchParamsRef.current(
      (prev) => {
        const next = new URLSearchParams(prev);

        // Omit page=1 and per_page=default to keep URLs clean
        if (page > 1) next.set(urlKey(pfx, "page"), String(page));
        else next.delete(urlKey(pfx, "page"));

        if (perPage !== defPerPage) next.set(urlKey(pfx, "per_page"), String(perPage));
        else next.delete(urlKey(pfx, "per_page"));

        if (search) next.set(urlKey(pfx, "q"), search);
        else next.delete(urlKey(pfx, "q"));

        if (sortKey) {
          next.set(urlKey(pfx, "sort"), sortKey);
          next.set(urlKey(pfx, "dir"), sortDir ?? "desc");
        } else {
          next.delete(urlKey(pfx, "sort"));
          next.delete(urlKey(pfx, "dir"));
        }

        fKeys.forEach((key) => {
          const paramKey = filterUrlKey(pfx, key);
          if (filters[key]) next.set(paramKey, filters[key]);
          else next.delete(paramKey);
        });

        return next;
      },
      { replace: true },
    );
  }, []); // ← intentionally empty — reads everything via refs

  return { syncToUrl, buildFetchParams };
}
