'use client';

import clsx from 'clsx';
import { Box, Film, ImagePlus, Loader2, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import { ApiError, message, useApi } from '@/lib/api';
import { Button, Modal, Pager, useToast } from './ui';

export interface MediaAsset {
  id: string;
  kind: 'IMAGE' | 'VIDEO' | 'MODEL_3D';
  storageKey: string;
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
  bytes: number;
  usedBy?: number;
  modelVariants?: string[];
}

/** Uploads one file to the media library. Images are re-encoded and stripped of location data on the server. */
export async function uploadMedia(file: File, alt?: string): Promise<MediaAsset> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`/api/admin/media${alt ? `?alt=${encodeURIComponent(alt)}` : ''}`, { method: 'POST', body, headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json?.code ?? 'ERROR', json?.detail ?? 'Upload failed.');
  return json;
}

export function MediaThumb({ asset, className }: { asset: Pick<MediaAsset, 'kind' | 'url' | 'altText'>; className?: string }) {
  if (asset.kind === 'IMAGE') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={asset.url} alt={asset.altText ?? ''} className={clsx('h-full w-full object-cover', className)} loading="lazy" />;
  }
  return (
    <div className={clsx('grid h-full w-full place-items-center bg-ink/[0.05] text-muted', className)}>
      {asset.kind === 'VIDEO' ? <Film className="h-6 w-6" /> : <Box className="h-6 w-6" />}
      <span className="sr-only">{asset.kind === 'VIDEO' ? 'Video' : '3D model'}</span>
    </div>
  );
}

export function MediaPicker({ open, onClose, onSelect, kind = 'IMAGE', title = 'Choose media' }: { open: boolean; onClose: () => void; onSelect: (a: MediaAsset) => void; kind?: 'IMAGE' | 'VIDEO' | 'MODEL_3D'; title?: string }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { data, reload } = useApi<{ items: MediaAsset[]; page: number; pageCount: number; total: number }>(open ? `/media?kind=${kind}&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}` : null);

  const upload = async (files: FileList) => {
    setUploading(true);
    try {
      let last: MediaAsset | null = null;
      for (const f of Array.from(files)) last = await uploadMedia(f, f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '));
      toast(files.length > 1 ? `${files.length} files uploaded` : 'File uploaded');
      await reload();
      if (last && files.length === 1) {
        onSelect(last);
        onClose();
      }
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setUploading(false);
    }
  };

  const accept = kind === 'IMAGE' ? 'image/jpeg,image/png,image/webp,image/avif' : kind === 'VIDEO' ? 'video/mp4,video/webm' : '.glb,model/gltf-binary';

  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search by alt text or file name"
              className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-[0.86rem]"
              aria-label="Search media"
            />
          </div>
          <Button variant="primary" onClick={() => input.current?.click()} loading={uploading}>
            <ImagePlus className="h-4 w-4" /> Upload
          </Button>
          <input ref={input} type="file" accept={accept} multiple hidden onChange={(e) => e.target.files?.length && upload(e.target.files)} />
        </div>
        <p className="text-[0.76rem] text-muted">
          {kind === 'IMAGE' && 'JPG, PNG, WebP or AVIF up to 25 MB. Images are resized to 3,000 px and location data is removed.'}
          {kind === 'VIDEO' && 'MP4 or WebM up to 100 MB. Keep the homepage film under 1.5 MB per 10 seconds for fast loading.'}
          {kind === 'MODEL_3D' && 'GLB files up to 50 MB (aim for 3 to 5 MB). Finishes should be glTF material variants so swatches can switch them.'}
        </p>
        {!data ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton aspect-square" />)}
          </div>
        ) : data.items.length === 0 ? (
          <p className="py-10 text-center text-[0.86rem] text-muted">No files yet. Upload one to get started.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {data.items.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onSelect(a);
                  onClose();
                }}
                className="group grid gap-1 text-left"
              >
                <span className="relative aspect-square overflow-hidden rounded-lg border border-line bg-canvas group-hover:ring-2 group-hover:ring-accent">
                  <MediaThumb asset={a} />
                </span>
                <span className="truncate text-[0.72rem] text-muted">{a.altText || a.storageKey.split('/').pop()}</span>
              </button>
            ))}
          </div>
        )}
        {data && <Pager page={data.page} pageCount={data.pageCount} onPage={setPage} />}
        {uploading && (
          <p className="flex items-center gap-2 text-[0.8rem] text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Processing upload…
          </p>
        )}
      </div>
    </Modal>
  );
}

/** A single image field that stores a storage key (rooms, collections, CMS blocks). */
export function ImageKeyField({ label, value, onChange, kind = 'IMAGE' }: { label: string; value: string | null | undefined; onChange: (key: string | null) => void; kind?: 'IMAGE' | 'VIDEO' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-1.5">
      <span className="text-[0.78rem] font-medium text-ink-soft">{label}</span>
      <div className="flex items-center gap-3">
        <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-line bg-canvas">
          {value ? <MediaThumb asset={{ kind, url: `/media/${value}`, altText: '' }} /> : <span className="grid h-full place-items-center text-[0.72rem] text-muted">None</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" type="button" onClick={() => setOpen(true)}>
            {value ? 'Change' : 'Choose'}
          </Button>
          {value && (
            <Button size="sm" type="button" variant="ghost" onClick={() => onChange(null)}>
              Remove
            </Button>
          )}
        </div>
      </div>
      <MediaPicker open={open} onClose={() => setOpen(false)} kind={kind} onSelect={(a) => onChange(a.storageKey)} />
    </div>
  );
}
