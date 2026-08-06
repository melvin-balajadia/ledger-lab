import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteRequest, fetchJson, patchJson, postFormData, postJson } from '../lib/api';
import type {
  MilestoneInput,
  POAttachment,
  POPayment,
  PoPaymentType,
  PurchaseOrder,
  PurchaseOrderDetail,
  VoidedPurchaseOrder,
} from '../types';
import { PROJECT_ID } from './useProjectData';

export function usePurchaseOrderDetail(poId: number | null) {
  return useQuery({
    queryKey: ['purchase-order', PROJECT_ID, poId],
    queryFn: () => fetchJson<PurchaseOrderDetail>(`/api/projects/${PROJECT_ID}/purchase-orders/${poId}`),
    enabled: poId != null,
  });
}

export interface CreatePurchaseOrderInput {
  por_no: string;
  msr_no: string;
  po_date: string;
  supplier_id: number | null;
  planning_line_id: number | null;
  item_description: string;
  ref_no: string;
  currency: string;
  contract_amount: string;
  fx_rate: string;
  remarks: string;
  milestones: MilestoneInput[];
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePurchaseOrderInput) =>
      postJson<PurchaseOrder>(`/api/projects/${PROJECT_ID}/purchase-orders`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-orders', PROJECT_ID] }),
  });
}

export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<CreatePurchaseOrderInput> & { id: number }) =>
      patchJson<PurchaseOrder>(`/api/projects/${PROJECT_ID}/purchase-orders/${id}`, body),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-order', PROJECT_ID, id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', PROJECT_ID] });
    },
  });
}

export interface RecordPaymentInput {
  poId: number;
  paid_on: string;
  payment_type: PoPaymentType;
  currency: string;
  amount: string;
  fx_rate: string;
  voucher_no: string;
}

export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ poId, ...body }: RecordPaymentInput) =>
      postJson<PurchaseOrder>(`/api/projects/${PROJECT_ID}/purchase-orders/${poId}/payments`, body),
    onSuccess: (_, { poId }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-order', PROJECT_ID, poId] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', PROJECT_ID] });
    },
  });
}

export function useUploadAttachment(poId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return postFormData<POAttachment>(`/api/projects/${PROJECT_ID}/purchase-orders/${poId}/attachments`, formData);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-order', PROJECT_ID, poId] }),
  });
}

export function useDeleteAttachment(poId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: number) =>
      deleteRequest(`/api/projects/${PROJECT_ID}/purchase-orders/${poId}/attachments/${attachmentId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-order', PROJECT_ID, poId] }),
  });
}

function invalidatePo(queryClient: ReturnType<typeof useQueryClient>, poId: number) {
  queryClient.invalidateQueries({ queryKey: ['purchase-order', PROJECT_ID, poId] });
  queryClient.invalidateQueries({ queryKey: ['purchase-orders', PROJECT_ID] });
}

// "Delete" voids -- the PO disappears from every list/total exactly like
// removing a spreadsheet row, but stays restorable from "Deleted items".
export function useVoidPurchaseOrder(poId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) =>
      deleteRequest(`/api/projects/${PROJECT_ID}/purchase-orders/${poId}`, reason ? { reason } : undefined),
    onSuccess: () => invalidatePo(queryClient, poId),
  });
}

export function useRestorePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (poId: number) => postJson(`/api/projects/${PROJECT_ID}/purchase-orders/${poId}/restore`, {}),
    onSuccess: (_, poId) => invalidatePo(queryClient, poId),
  });
}

export function useVoidedPurchaseOrders(enabled: boolean) {
  return useQuery({
    queryKey: ['purchase-orders', PROJECT_ID, 'voided'],
    queryFn: () => fetchJson<VoidedPurchaseOrder[]>(`/api/projects/${PROJECT_ID}/purchase-orders/voided`),
    enabled,
  });
}

export function useVoidPoPayment(poId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: number; reason?: string }) =>
      deleteRequest(
        `/api/projects/${PROJECT_ID}/purchase-orders/${poId}/payments/${paymentId}`,
        reason ? { reason } : undefined,
      ),
    onSuccess: () => invalidatePo(queryClient, poId),
  });
}

export function useRestorePoPayment(poId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: number) =>
      postJson(`/api/projects/${PROJECT_ID}/purchase-orders/${poId}/payments/${paymentId}/restore`, {}),
    onSuccess: () => invalidatePo(queryClient, poId),
  });
}

export function useVoidedPoPayments(poId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['purchase-order', PROJECT_ID, poId, 'voided-payments'],
    queryFn: () => fetchJson<POPayment[]>(`/api/projects/${PROJECT_ID}/purchase-orders/${poId}/payments/voided`),
    enabled,
  });
}
