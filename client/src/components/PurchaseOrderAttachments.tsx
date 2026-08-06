import { useEffect, useRef, useState } from 'react';
import { fetchImageUrl } from '../lib/api';
import { useDeleteAttachment, useUploadAttachment } from '../hooks/usePurchaseOrders';
import { PROJECT_ID } from '../hooks/useProjectData';
import { Modal } from './Modal';
import type { POAttachment } from '../types';

export function PurchaseOrderAttachments({ poId, attachments }: { poId: number; attachments: POAttachment[] }) {
  const upload = useUploadAttachment(poId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<POAttachment | null>(null);

  async function handleFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await upload.mutateAsync(file);
  }

  return (
    <div className="flex flex-col gap-3 border-t border-rule pt-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
          MSR / reference photos
        </span>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={upload.isPending}
          className="text-sm font-medium text-accent hover:underline disabled:opacity-60"
        >
          {upload.isPending ? 'Uploading…' : '+ Add photo'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleFileChosen}
        />
      </div>

      {upload.error && <p className="text-sm text-danger">{upload.error.message}</p>}

      {attachments.length === 0 ? (
        <p className="text-sm text-ink-faint">No photos attached yet.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {attachments.map((a) => (
            <AttachmentThumb key={a.id} poId={poId} attachment={a} onOpen={() => setLightbox(a)} />
          ))}
        </div>
      )}

      {lightbox && (
        <Modal title={lightbox.original_name} onClose={() => setLightbox(null)}>
          <AttachmentFullImage poId={poId} attachment={lightbox} />
        </Modal>
      )}
    </div>
  );
}

function useAttachmentImageUrl(poId: number, attachmentId: number) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchImageUrl(`/api/projects/${PROJECT_ID}/purchase-orders/${poId}/attachments/${attachmentId}/file`).then((u) => {
      if (cancelled) {
        URL.revokeObjectURL(u);
        return;
      }
      objectUrl = u;
      setUrl(u);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [poId, attachmentId]);

  return url;
}

function AttachmentThumb({
  poId,
  attachment,
  onOpen,
}: {
  poId: number;
  attachment: POAttachment;
  onOpen: () => void;
}) {
  const deleteAttachment = useDeleteAttachment(poId);
  const url = useAttachmentImageUrl(poId, attachment.id);

  function handleDelete(event: React.MouseEvent) {
    event.stopPropagation();
    if (window.confirm(`Remove "${attachment.original_name}"?`)) {
      deleteAttachment.mutate(attachment.id);
    }
  }

  return (
    <div className="group relative h-24 w-24 overflow-hidden rounded-sm border border-rule-strong bg-surface-2">
      {url ? (
        <button type="button" onClick={onOpen} className="h-full w-full">
          <img src={url} alt={attachment.original_name} className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-ink-faint">Loading…</div>
      )}
      <button
        type="button"
        onClick={handleDelete}
        aria-label="Remove photo"
        className="absolute right-1 top-1 hidden rounded-full bg-black/60 px-1.5 text-xs text-white group-hover:block"
      >
        ×
      </button>
    </div>
  );
}

function AttachmentFullImage({ poId, attachment }: { poId: number; attachment: POAttachment }) {
  const url = useAttachmentImageUrl(poId, attachment.id);
  if (!url) return <p className="text-sm text-ink-muted">Loading…</p>;
  return <img src={url} alt={attachment.original_name} className="max-h-[75vh] w-full object-contain" />;
}
