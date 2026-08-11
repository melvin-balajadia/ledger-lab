import { useEffect, useRef, useState } from 'react';
import { fetchImageUrl } from '../lib/api';
import { useDeleteAttachment, useUploadAttachment } from '../hooks/usePurchaseOrders';
import { PROJECT_ID } from '../hooks/useProjectData';
import { Modal } from './Modal';
import { IconFileText } from './icons';
import type { POAttachment } from '../types';

const PDF_TYPE = 'application/pdf';

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
          MSR / reference attachments
        </span>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={upload.isPending}
          className="text-sm font-medium text-accent hover:underline disabled:opacity-60"
        >
          {upload.isPending ? 'Uploading…' : '+ Add file'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          className="hidden"
          onChange={handleFileChosen}
        />
      </div>

      {upload.error && <p className="text-sm text-danger">{upload.error.message}</p>}

      {attachments.length === 0 ? (
        <p className="text-sm text-ink-faint">No files attached yet.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {attachments.map((a) => (
            <AttachmentThumb key={a.id} poId={poId} attachment={a} onOpen={() => setLightbox(a)} />
          ))}
        </div>
      )}

      {lightbox && (
        <Modal title={lightbox.original_name} onClose={() => setLightbox(null)}>
          <AttachmentFullView poId={poId} attachment={lightbox} />
        </Modal>
      )}
    </div>
  );
}

// `skip` avoids fetching the whole file just to render a thumbnail --
// PDFs show a static icon in the grid (see AttachmentThumb) and only need
// the actual blob once opened full-size in the lightbox.
function useAttachmentFileUrl(poId: number, attachmentId: number, skip = false) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (skip) return;
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
  }, [poId, attachmentId, skip]);

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
  const isPdf = attachment.content_type === PDF_TYPE;
  const url = useAttachmentFileUrl(poId, attachment.id, isPdf);

  function handleDelete(event: React.MouseEvent) {
    event.stopPropagation();
    if (window.confirm(`Remove "${attachment.original_name}"?`)) {
      deleteAttachment.mutate(attachment.id);
    }
  }

  return (
    <div className="group relative h-24 w-24 overflow-hidden rounded-sm border border-rule-strong bg-surface-2">
      {isPdf ? (
        <button
          type="button"
          onClick={onOpen}
          title={attachment.original_name}
          className="flex h-full w-full flex-col items-center justify-center gap-1 px-1.5 text-ink-muted"
        >
          <IconFileText className="h-8 w-8 shrink-0" />
          <span className="w-full truncate text-center text-[10px] font-medium leading-tight">
            {attachment.original_name}
          </span>
        </button>
      ) : url ? (
        <button type="button" onClick={onOpen} className="h-full w-full">
          <img src={url} alt={attachment.original_name} className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-ink-faint">Loading…</div>
      )}
      <button
        type="button"
        onClick={handleDelete}
        aria-label="Remove file"
        className="absolute right-1 top-1 hidden rounded-full bg-black/60 px-1.5 text-xs text-white group-hover:block"
      >
        ×
      </button>
    </div>
  );
}

function AttachmentFullView({ poId, attachment }: { poId: number; attachment: POAttachment }) {
  const url = useAttachmentFileUrl(poId, attachment.id);
  if (!url) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (attachment.content_type === PDF_TYPE) {
    // Browser's built-in PDF viewer, same as opening a PDF directly -- zoom,
    // print, and download come for free, no PDF-rendering library needed.
    return <iframe src={url} title={attachment.original_name} className="h-[75vh] w-full rounded-sm border border-rule" />;
  }
  return <img src={url} alt={attachment.original_name} className="max-h-[75vh] w-full object-contain" />;
}
