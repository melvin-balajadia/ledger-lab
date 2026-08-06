import { useCallback, useState } from "react";
import { fetchJson } from "../lib/api";
import { toPageMeta } from "../lib/dataTablePage";
import { formatMoney } from "../lib/formatMoney";
import { PROJECT_ID } from "../hooks/useProjectData";
import {
  useRestoreCashAdvance,
  useVoidedCashAdvances,
} from "../hooks/useCashAdvances";
import {
  CashAdvanceFilters,
  type CashAdvanceFilterValues,
} from "../components/CashAdvanceFilters";
import { CashAdvanceForm } from "../components/CashAdvanceForm";
import {
  DataTable,
  type ColumnDef,
  type FetchParams,
} from "../components/DataTable";
import { SegmentedControl } from "../components/SegmentedControl";
import { StatusPill } from "../components/StatusPill";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { DeletedItemsModal } from "../components/DeletedItemsModal";
import type { Tone } from "../lib/tones";
import type {
  CashAdvance,
  CashAdvanceListResponse,
  CashAdvanceStatus,
} from "../types";

const STATUS_LABEL: Record<CashAdvanceStatus, string> = {
  open: "Open",
  partially_liquidated: "Partially liquidated",
  liquidated: "Liquidated",
};

const STATUS_TONE: Record<CashAdvanceStatus, Tone> = {
  open: "warn",
  partially_liquidated: "info",
  liquidated: "success",
};

const columns: ColumnDef<CashAdvance>[] = [
  { key: "txn_date", label: "Date", sortable: true },
  {
    key: "control_no",
    label: "Control No.",
    render: (value) => (value as string) ?? "—",
  },
  {
    key: "planning_line_code",
    label: "JPL Code",
    render: (value) =>
      value ? (
        <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">
          {value as string}
        </span>
      ) : (
        "—"
      ),
  },
  {
    key: "requested_by",
    label: "Requested by",
    cardTitle: true,
    render: (value) => (value as string) ?? "—",
  },
  {
    key: "purpose",
    label: "Purpose",
    cardSubtitle: true,
    render: (value) => (value as string) ?? "—",
  },
  {
    key: "amount",
    label: "Amount",
    sortable: true,
    align: "right",
    render: (value) => (
      <span className="font-mono">{formatMoney(value as string)}</span>
    ),
  },
  {
    key: "liquidated_amount",
    label: "Liquidated",
    align: "right",
    render: (value) => (
      <span className="font-mono">{formatMoney(value as string)}</span>
    ),
  },
  {
    key: "status",
    label: "Status",
    render: (value) => (
      <StatusPill tone={STATUS_TONE[value as CashAdvanceStatus]}>
        {STATUS_LABEL[value as CashAdvanceStatus]}
      </StatusPill>
    ),
  },
  {
    key: "needs_review",
    label: "Review",
    render: (value) =>
      value ? <StatusPill tone="warn">Needs review</StatusPill> : "—",
  },
];

export function CashAdvances() {
  const [needsReviewOnly, setNeedsReviewOnly] = useState<"all" | "flagged">(
    "all",
  );
  const [filters, setFilters] = useState<CashAdvanceFilterValues>({
    date_from: "",
    date_to: "",
  });
  const [modal, setModal] = useState<"create" | CashAdvance | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showDeleted, setShowDeleted] = useState(false);
  const voidedQuery = useVoidedCashAdvances(showDeleted);
  const restoreMutation = useRestoreCashAdvance();

  const fetchData = useCallback(
    async ({
      page,
      perPage,
      search,
      sortKey,
      sortDir,
      signal,
    }: FetchParams) => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(perPage));
      if (search) params.set("q", search);
      if (sortKey) {
        params.set("sortKey", sortKey);
        params.set("sortDir", sortDir ?? "asc");
      }
      if (needsReviewOnly === "flagged") params.set("needs_review", "1");
      if (filters.status) params.set("status", filters.status);
      if (filters.planning_line_id)
        params.set("planning_line_id", String(filters.planning_line_id));
      if (filters.date_from) params.set("date_from", filters.date_from);
      if (filters.date_to) params.set("date_to", filters.date_to);

      const json = await fetchJson<CashAdvanceListResponse>(
        `/api/projects/${PROJECT_ID}/cash-advances?${params}`,
        { signal },
      );
      return { data: json.rows, meta: toPageMeta(json) };
    },
    [filters, needsReviewOnly],
  );

  function handleModalClose() {
    setModal(null);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">
          Cash Advances
        </h2>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setShowDeleted(true)}
            className="text-sm font-medium text-ink-muted hover:text-ink hover:underline"
          >
            Deleted items
          </button>
          <Button type="button" onClick={() => setModal("create")}>
            + New entry
          </Button>
        </div>
      </div>

      <SegmentedControl
        value={needsReviewOnly}
        onChange={setNeedsReviewOnly}
        options={[
          { label: "All", value: "all" },
          { label: "Needs review", value: "flagged" },
        ]}
      />

      <CashAdvanceFilters onChange={setFilters} />

      <DataTable<CashAdvance>
        columns={columns}
        fetchData={fetchData}
        rowKey="id"
        onView={(row) => setModal(row)}
        exportable
        title="Cash Advances"
        perPageOptions={[25, 50, 100]}
        searchPlaceholder="Search purpose, requested by, or control no…"
        emptyMessage="No cash advances match these filters."
        refreshKey={refreshKey}
      />

      {modal && (
        <Modal
          title={modal === "create" ? "New cash advance" : "Edit cash advance"}
          onClose={handleModalClose}
        >
          <CashAdvanceForm
            cashAdvance={modal === "create" ? undefined : modal}
            onClose={handleModalClose}
          />
        </Modal>
      )}

      {showDeleted && (
        <DeletedItemsModal<CashAdvance>
          title="Deleted cash advances"
          items={voidedQuery.data?.rows}
          isLoading={voidedQuery.isLoading}
          onRestore={async (id) => {
            await restoreMutation.mutateAsync(id);
            setRefreshKey((k) => k + 1);
          }}
          onClose={() => setShowDeleted(false)}
          renderRow={(ca) => (
            <>
              <div className="font-medium">
                {ca.txn_date} — {ca.requested_by ?? "No requester"} —{" "}
                {formatMoney(ca.amount)}
              </div>
              <div className="text-xs text-ink-muted">{ca.purpose ?? "—"}</div>
              <div className="mt-1 text-xs text-ink-faint">
                Deleted {ca.voided_at} by {ca.voided_by}
                {ca.void_reason ? ` — "${ca.void_reason}"` : ""}
              </div>
            </>
          )}
        />
      )}
    </div>
  );
}
