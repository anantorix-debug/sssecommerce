'use client';

import { ImagePlus, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import { MediaThumb, uploadMedia, type MediaAsset } from '@/components/MediaPicker';
import { useCan } from '@/components/staff';
import { Badge, Button, Card, ErrorBox, FilterTabs, Input, Loading, Modal, PageHeader, Pager, useToast } from '@/components/ui';
import { api, date, message, useApi } from '@/lib/api';

type Asset = MediaAsset & { createdAt: string };

export default function MediaPage() {
  const can = useCan();
  const toast = useToast();
  const [kind, setKind] = useState('IMAGE');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, reload } = useApi<{ items: Asset[]; page: number; pageCount: number; total: number }>(`/media?page=${page}${kind ? `&kind=${kind}` : ''}${search ? `&q=${encodeURIComponent(search)}` : ''}`);
  const [sel, setSel] = useState<Asset | null>(null);
  const [alt, setAlt] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList) => {
    setBusy(true);
    let ok = 0;
    for (const f of Array.from(files)) {
      try {
        await uploadMedia(f, f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '));
        ok++;
      } catch (err) {
        toast(`${f.name}: ${message(err)}`, 'error');
      }
    }
    if (ok) toast(`${ok} file${ok > 1 ? 's' : ''} uploaded`);
    setBusy(false);
    void reload();
  };

  const fmt = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

  return (
    <>
      <PageHeader
        title="Media library"
        description="Every image, video and 3D model, stored on your server. Deleted files are kept for 30 days before being removed."
        actions={
          can('media.write') && (
            <>
              <Button variant="primary" onClick={() => input.current?.click()} loading={busy}><ImagePlus className="h-4 w-4" /> Upload</Button>
              <input ref={input} type="file" multiple hidden accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,.glb" onChange={(e) => e.target.files?.length && upload(e.target.files)} />
            </>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterTabs value={kind} onChange={(v) => { setKind(v); setPage(1); }} options={[{ value: 'IMAGE', label: 'Images' }, { value: 'VIDEO', label: 'Video' }, { value: 'MODEL_3D', label: '3D models' }]} />
        <form className="relative min-w-60 flex-1" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search alt text or file name" aria-label="Search media" className="h-10 w-full max-w-md rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-[0.86rem]" />
        </form>
      </div>
      <ErrorBox message={error} />
      <Card padded={false}>
        {!data ? (
          <Loading />
        ) : data.items.length === 0 ? (
          <p className="p-10 text-center text-muted">No files here yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4 xl:grid-cols-6">
            {data.items.map((a) => (
              <button key={a.id} type="button" onClick={() => { setSel(a); setAlt(a.altText ?? ''); }} className="group grid gap-1.5 text-left">
                <span className="relative aspect-square overflow-hidden rounded-lg border border-line bg-canvas group-hover:ring-2 group-hover:ring-accent">
                  <MediaThumb asset={a} />
                  {!a.altText && a.kind === 'IMAGE' && <span className="absolute left-1.5 top-1.5"><Badge tone="danger">No alt</Badge></span>}
                </span>
                <span className="truncate text-[0.74rem] text-muted">{a.altText || a.storageKey.split('/').pop()}</span>
              </button>
            ))}
          </div>
        )}
        {data && <Pager page={data.page} pageCount={data.pageCount} total={data.total} onPage={setPage} />}
      </Card>
      <Modal
        open={sel !== null}
        onClose={() => setSel(null)}
        title="File details"
        wide
        footer={
          sel &&
          can('media.write') && (
            <>
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await api(`/media/${sel.id}`, { method: 'DELETE' });
                    toast('Moved to trash. It is removed for good after 30 days.');
                    setSel(null);
                    void reload();
                  } catch (err) {
                    toast(message(err), 'error');
                  }
                }}
              >
                Delete
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  try {
                    await api(`/media/${sel.id}`, { method: 'PATCH', json: { altText: alt } });
                    toast('Alt text saved');
                    setSel(null);
                    void reload();
                  } catch (err) {
                    toast(message(err), 'error');
                  }
                }}
              >
                Save
              </Button>
            </>
          )
        }
      >
        {sel && (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="aspect-square overflow-hidden rounded-lg border border-line bg-canvas">
              {sel.kind === 'VIDEO' ? <video src={sel.url} controls className="h-full w-full object-contain" /> : <MediaThumb asset={sel} className={sel.kind === 'IMAGE' ? 'object-contain' : ''} />}
            </div>
            <div className="grid content-start gap-4">
              <Input label="Alt text" value={alt} onChange={(e) => setAlt(e.target.value)} hint="Describe what’s in the image for screen readers and search engines, e.g. “Walnut coffee table with a lower shelf, in a sunlit living room”." />
              <dl className="grid gap-1.5 text-[0.82rem]">
                <div className="flex justify-between"><dt className="text-muted">Type</dt><dd>{sel.kind === 'MODEL_3D' ? '3D model (GLB)' : sel.kind.toLowerCase()}</dd></div>
                {sel.width && <div className="flex justify-between"><dt className="text-muted">Size</dt><dd className="tabular">{sel.width} × {sel.height} px</dd></div>}
                <div className="flex justify-between"><dt className="text-muted">File size</dt><dd className="tabular">{fmt(sel.bytes)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Used by</dt><dd>{sel.usedBy ?? 0} products</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Uploaded</dt><dd>{date(sel.createdAt)}</dd></div>
                <div className="grid gap-0.5"><dt className="text-muted">Address</dt><dd className="select-all break-all font-mono text-[0.74rem]">{sel.url}</dd></div>
              </dl>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
