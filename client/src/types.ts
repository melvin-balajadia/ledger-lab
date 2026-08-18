// Money fields are `string` throughout, not `number` -- these are MySQL
// DECIMAL(18,2) values serialized as-is. Never parseFloat/Number() them
// except to format a single value for display (see lib/formatMoney.ts).

export interface BudgetSummaryRow {
  budget_item_id: number;
  project_id: number;
  item_no: string;
  description: string;
  procurement_mode: string;
  remarks: string | null;
  budget: string;
  contract_amount: string;
  labor_cost: string;
  cash_advanced: string;
  paid_po_amount: string;
  replen_amount: string;
  additional_payment: string;
  total_disbursed: string;
  remaining_vs_contract: string;
  remaining_vs_disbursed: string;
  commitment_ratio: string | null;
  is_over_budget: 0 | 1;
  revision_count: number;
}

export interface ProjectKpis {
  total_budget: string;
  total_committed: string;
  total_disbursed: string;
  remaining_vs_contract: string;
  remaining_vs_disbursed: string;
  committed_pct: string | null;
}

export type RefType = 'SI' | 'CI' | 'CSI' | 'OR' | 'BS' | 'MSR' | 'other';

// Index signature lets Replenishment satisfy DataTable's generic constraint
// (it needs to read arbitrary column keys); every field here is already a
// subtype of `unknown` so this adds no real looseness.
export interface Replenishment {
  [key: string]: unknown;
  id: number;
  project_id: number;
  txn_date: string;
  supplier_id: number | null;
  planning_line_id: number | null;
  budget_item_id: number | null;
  item_description: string | null;
  ref_no: string | null;
  ref_type: RefType | null;
  amount: string;
  batch_no: string | null;
  document_no: string | null;
  needs_review: 0 | 1;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  supplier_name: string | null;
  planning_line_code: string | null;
  planning_line_description: string | null;
}

// One row per (budget_item, planning_line) combo actually present in the
// filtered set -- grouped client-side into a budget-item tree with JPL
// codes nested underneath (see lib/budgetItemGrouping.ts).
export interface BudgetItemJplTotal {
  budget_item_id: number | null;
  budget_item_no: string | null;
  budget_item_description: string | null;
  planning_line_id: number | null;
  planning_line_code: string | null;
  total: string;
}

export interface ReplenishmentSummary {
  row_count: number;
  total_amount: string;
  needs_review_count: number;
  by_budget_item: BudgetItemJplTotal[];
}

export interface ReplenishmentListResponse {
  rows: Replenishment[];
  page: number;
  pageSize: number;
  total: number;
  summary: ReplenishmentSummary;
}

export interface ReplenishmentLineInput {
  txn_date: string;
  supplier_id: number | null;
  planning_line_id: number | null;
  budget_item_id: number | null;
  item_description: string;
  ref_no: string;
  ref_type: RefType | '';
  amount: string;
}

export type CashAdvanceStatus = 'open' | 'partially_liquidated' | 'liquidated';

export interface CashAdvance {
  [key: string]: unknown;
  id: number;
  project_id: number;
  txn_date: string;
  planning_line_id: number | null;
  budget_item_id: number | null;
  requested_by: string | null;
  purpose: string | null;
  amount: string;
  liquidated_amount: string;
  status: CashAdvanceStatus;
  document_no: string | null;
  control_no: string | null;
  liquidation_control_no: string | null;
  needs_review: 0 | 1;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  planning_line_code: string | null;
  planning_line_description: string | null;
}

export interface CashAdvanceSummary {
  row_count: number;
  total_amount: string;
  total_liquidated: string;
  outstanding_amount: string;
  needs_review_count: number;
  by_budget_item: BudgetItemJplTotal[];
}

export interface CashAdvanceListResponse {
  rows: CashAdvance[];
  page: number;
  pageSize: number;
  total: number;
  summary: CashAdvanceSummary;
}

export interface CashAdvanceLineInput {
  txn_date: string;
  planning_line_id: number | null;
  budget_item_id: number | null;
  requested_by: string;
  purpose: string;
  control_no: string;
  amount: string;
}

export type ExpenseType = 'customs_duty' | 'freight' | 'terminal_handling' | 'insurance' | 'brokerage' | 'other';

export interface AdditionalPayment {
  [key: string]: unknown;
  id: number;
  project_id: number;
  txn_date: string;
  payee: string;
  supplier_id: number | null;
  planning_line_id: number | null;
  budget_item_id: number | null;
  description: string | null;
  voucher_no: string | null;
  expense_type: ExpenseType;
  currency: string;
  amount: string;
  fx_rate: string;
  amount_php: string;
  document_no: string | null;
  needs_review: 0 | 1;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  supplier_name: string | null;
  planning_line_code: string | null;
  planning_line_description: string | null;
}

export interface AdditionalPaymentSummary {
  row_count: number;
  total_amount: string;
  needs_review_count: number;
  by_expense_type: { expense_type: ExpenseType; total: string }[];
  by_budget_item: BudgetItemJplTotal[];
}

export interface AdditionalPaymentListResponse {
  rows: AdditionalPayment[];
  page: number;
  pageSize: number;
  total: number;
  summary: AdditionalPaymentSummary;
}

export interface AdditionalPaymentLineInput {
  txn_date: string;
  payee: string;
  supplier_id: number | null;
  planning_line_id: number | null;
  budget_item_id: number | null;
  description: string;
  voucher_no: string;
  expense_type: ExpenseType | '';
  amount: string;
}

export interface PlanningLine {
  id: number;
  code: string;
  parent_id: number | null;
  depth: number;
  description: string | null;
  budget_item_id: number | null;
  budget_amount?: string | null;
  is_active?: 0 | 1;
}

export interface Supplier {
  id: number;
  name: string;
  normalized_name: string;
  tin?: string | null;
  category: string | null;
  is_active: 0 | 1;
  created_at?: string;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface SupplierListResponse {
  rows: Supplier[];
  page: number;
  pageSize: number;
  total: number;
}

export type PoStatus = 'open' | 'partially_paid' | 'fully_paid' | 'cancelled';

// Index signature lets PurchaseOrder satisfy DataTable's generic constraint
// (it needs to read arbitrary column keys, incl. the synthetic "outstanding"
// filter key); every field here is already a subtype of `unknown`.
export interface PurchaseOrder {
  [key: string]: unknown;
  id: number;
  project_id: number;
  por_no: string;
  msr_no: string | null;
  po_date: string | null;
  supplier: string;
  item_no: string | null;
  budget_item: string | null;
  currency: string;
  contract_amount: string;
  fx_rate: string;
  contract_amount_php: string;
  paid_php: string;
  balance_php: string;
  pct_paid: string | null;
  payment_terms: string | null;
  status: PoStatus;
  supplier_id: number;
  budget_item_id: number | null;
  planning_line_id: number | null;
  item_description: string | null;
  ref_no: string | null;
  remarks: string | null;
  retention_pct: string | null;
}

export interface PurchaseOrderSummary {
  row_count: number;
  total_contract: string;
  total_paid: string;
  total_balance: string;
  outstanding_count: number;
  by_budget_item: BudgetItemJplTotal[];
}

export interface PurchaseOrderListResponse {
  rows: PurchaseOrder[];
  page: number;
  pageSize: number;
  total: number;
  summary: PurchaseOrderSummary;
}

export interface POPaymentTerm {
  id: number;
  purchase_order_id: number;
  seq: number;
  label: string;
  pct: string;
  kind: string;
  is_holdback: 0 | 1;
}

export interface POPayment {
  id: number;
  purchase_order_id: number;
  paid_on: string | null;
  payment_type: string;
  currency: string;
  amount: string;
  fx_rate: string;
  amount_php: string;
  pct_of_contract: string | null;
  voucher_no: string | null;
  remarks: string | null;
  created_at: string;
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
}

export interface Retention {
  id: number;
  project_id: number;
  por_no: string;
  supplier: string;
  item_no: string | null;
  contract_amount_php: string;
  retention_pct: string;
  retention_amount: string;
  retention_released: string;
  retention_outstanding: string;
}

export interface POAttachment {
  id: number;
  original_name: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface VoidedPurchaseOrder {
  id: number;
  por_no: string;
  po_date: string | null;
  supplier: string;
  contract_amount_php: string;
  voided_at: string;
  voided_by: string | null;
  void_reason: string | null;
}

export interface PurchaseOrderDetail extends PurchaseOrder {
  milestones: POPaymentTerm[];
  payments: POPayment[];
  retention: Retention | null;
  attachments: POAttachment[];
}

export interface BudgetRevision {
  id: number;
  project_id: number;
  budget_item_id: number;
  revision_no: number;
  effective_on: string;
  amount_before: string;
  amount_after: string;
  delta: string;
  reason: string | null;
  approved_by: string | null;
  created_at: string;
}

export interface BudgetItemDetail extends BudgetSummaryRow {
  revisions: BudgetRevision[];
}

export interface RevisionInput {
  effective_on: string;
  amount_after: string;
  reason: string;
  approved_by: string;
}

export interface BudgetItemInput {
  item_no: string;
  description: string;
  original_budget: string;
  contract_amount: string;
  procurement_mode?: string;
  remarks?: string | null;
}

// original_budget and revised_budget are sent together, from one "Budget"
// input: while no revision is logged they are equal by construction (the seed
// and the create endpoint both set both), and the server rejects a baseline
// edit once one exists -- at which point original_budget correctly stays
// frozen at the pre-revision figure and revisions own the number.
export interface BudgetItemPatch {
  description?: string;
  original_budget?: string;
  revised_budget?: string;
  contract_amount?: string;
  procurement_mode?: string;
  remarks?: string | null;
}

export interface AuthUser {
  username: string;
  full_name: string | null;
}

export interface CostBreakdown {
  payroll: string;
  replenishments: string;
  po_payments: string;
  cash_advances: string;
  additional_payments: string;
}

export interface CostTrendPoint extends CostBreakdown {
  month: string;
  total: string;
  commitment: string;
}

export interface RetentionPo {
  id: number;
  por_no: string;
  supplier: string;
  item_no: string | null;
  contract_amount_php: string;
  retention_pct: string;
  retention_amount: string;
  retention_released: string;
  retention_outstanding: string;
}

export interface RetentionSummary {
  total_held: string;
  total_released: string;
  total_outstanding: string;
  pos: RetentionPo[];
}

export interface VatSummary {
  gross_amount: string;
  vat_component: string;
  net_of_vat: string;
}

export interface TopSupplier {
  id: number;
  name: string;
  total_spend: string;
  pct_of_total: string | null;
}

export interface WeeklyBurnPoint {
  week_start: string;
  total: string;
}

export type AlertSeverity = 'danger' | 'warn' | 'info' | 'success';

export interface DashboardAlert {
  severity: AlertSeverity;
  message: string;
  date: string | null;
}

export interface WbsRow {
  planning_line_id: number;
  project_id: number;
  budget_item_id: number | null;
  code: string;
  description: string | null;
  parent_id: number | null;
  depth: number;
  budget_amount: string | null;
  is_active: 0 | 1;
  replen_amount: string;
  po_paid_amount: string;
  cash_advance_amount: string;
  additional_payment_amount: string;
  labor_amount: string;
  total_spend: string;
}

export type PayrollWorkflowStatus = 'draft' | 'approved' | 'paid';
export type ReconciliationStatus = 'ok' | 'review' | 'no_control' | 'no_entries';

// Index signatures let these satisfy DataTable's generic constraint (it
// needs to read arbitrary column keys); every field here is already a
// subtype of `unknown` so this adds no real looseness.
export interface PayrollPeriod {
  [key: string]: unknown;
  id: number;
  label: string;
  period_start: string;
  period_end: string;
  status: PayrollWorkflowStatus;
  control_total: string;
  extracted_total: string;
  delta: string;
  entry_count: number;
  reconciliation_status: ReconciliationStatus;
}

export interface PayrollPeriodSummary {
  row_count: number;
  total_control: string;
  total_extracted: string;
  total_delta: string;
  attention_count: number;
}

export interface PayrollPeriodListResponse {
  rows: PayrollPeriod[];
  page: number;
  pageSize: number;
  total: number;
  summary: PayrollPeriodSummary;
}

export interface CopyRosterSource {
  id: number;
  label: string;
  period_start: string;
  period_end: string;
  entry_count: number;
}

export interface PayrollEntry {
  [key: string]: unknown;
  id: number;
  worker_id: number;
  worker_name: string;
  position: string | null;
  planning_line_id: number | null;
  planning_line_code: string | null;
  budget_item_id: number | null;
  budget_item_no: string | null;
  budget_item_description: string | null;
  amount: string;
  void_reason?: string | null;
}

export interface Worker {
  [key: string]: unknown;
  id: number;
  employee_no: string | null;
  last_name?: string;
  first_name?: string;
  middle_name?: string | null;
  full_name: string;
  position: string | null;
  date_hired?: string | null;
  is_active: 0 | 1;
  date_separated: string | null;
  total_earned: string;
}

export interface WorkerSummary {
  row_count: number;
  total_earned: string;
}

export interface WorkerListResponse {
  rows: Worker[];
  page: number;
  pageSize: number;
  total: number;
  summary: WorkerSummary;
}

export interface WorkerPayrollEntry {
  [key: string]: unknown;
  id: number;
  payroll_period_id: number;
  period_label: string;
  period_start: string;
  period_end: string;
  planning_line_id: number | null;
  planning_line_code: string | null;
  amount: string;
}

export interface WorkerBasicInfo {
  id: number;
  employee_no: string | null;
  full_name: string;
  position: string | null;
  is_active: 0 | 1;
  date_separated: string | null;
}

export interface WorkerPayrollEntriesResponse {
  worker: WorkerBasicInfo;
  entries: WorkerPayrollEntry[];
}

export type MilestoneKind =
  | 'downpayment'
  | 'progress'
  | 'before_delivery'
  | 'upon_delivery'
  | 'completion'
  | 'retention'
  | 'other';

// pct here is the decimal ratio the API expects (0.9, not 90) -- the form
// collects a whole percentage and converts right before building the request.
export interface MilestoneInput {
  label: string;
  pct: string;
  kind: MilestoneKind;
  is_holdback: boolean;
}

export type PoPaymentType = 'downpayment' | 'progress' | 'before_delivery' | 'cod' | 'completion' | 'retention' | 'other';
