import { useCallback, useState } from 'react';
import { fetchJson } from '../lib/api';
import { toPageMeta } from '../lib/dataTablePage';
import { SupplierForm } from '../components/SupplierForm';
import { DataTable, type ColumnDef, type FetchParams } from '../components/DataTable';
import { SegmentedControl } from '../components/SegmentedControl';
import { StatusPill } from '../components/StatusPill';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import type { Supplier, SupplierListResponse } from '../types';

const columns: ColumnDef<Supplier>[] = [
  { key: 'name', label: 'Supplier name', sortable: true, cardTitle: true },
  { key: 'tin', label: 'TIN', render: (value) => (value as string) ?? '—' },
  {
    key: 'is_active',
    label: 'Status',
    cardSubtitle: true,
    render: (value) =>
      value ? <StatusPill tone="success">Active</StatusPill> : <StatusPill tone="info">Inactive</StatusPill>,
  },
];

export function Suppliers() {
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [modal, setModal] = useState<'create' | Supplier | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchData = useCallback(
    async ({ page, perPage, search, sortKey, sortDir, signal }: FetchParams) => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(perPage));
      if (search) params.set('q', search);
      if (sortKey) {
        params.set('sortKey', sortKey);
        params.set('sortDir', sortDir ?? 'asc');
      }
      if (activeFilter !== 'all') params.set('is_active', activeFilter === 'active' ? '1' : '0');

      const json = await fetchJson<SupplierListResponse>(`/api/suppliers?${params}`, { signal });
      return { data: json.rows, meta: toPageMeta(json) };
    },
    [activeFilter],
  );

  function handleModalClose() {
    setModal(null);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">Suppliers</h2>
        <Button type="button" onClick={() => setModal('create')}>
          + New supplier
        </Button>
      </div>

      <SegmentedControl
        value={activeFilter}
        onChange={setActiveFilter}
        options={[
          { label: 'All', value: 'all' },
          { label: 'Active', value: 'active' },
          { label: 'Inactive', value: 'inactive' },
        ]}
      />

      <DataTable<Supplier>
        columns={columns}
        fetchData={fetchData}
        rowKey="id"
        onView={(row) => setModal(row)}
        exportable
        title="Suppliers"
        perPageOptions={[50, 100, 200]}
        searchPlaceholder="Search supplier name…"
        emptyMessage="No suppliers match these filters."
        refreshKey={refreshKey}
      />

      {modal && (
        <Modal title={modal === 'create' ? 'New supplier' : 'Edit supplier'} onClose={handleModalClose}>
          <SupplierForm supplier={modal === 'create' ? undefined : modal} onClose={handleModalClose} />
        </Modal>
      )}
    </div>
  );
}
