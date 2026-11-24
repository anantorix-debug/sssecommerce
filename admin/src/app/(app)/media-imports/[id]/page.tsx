'use client';

import clsx from 'clsx';
import { Check, Download, ImageOff, RotateCcw, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useCan } from '@/components/staff';
import { Badge, Button, Card, Empty, ErrorBox, FilterTabs, Loading, PageHeader, useToast } from '@/components/ui';
import { api, dateTime, message, useApi } from '@/lib/api';
import { countAll, JOB_LABEL, JOB_TONE, type ItemStatus, type Job } from '../shared';

type Item = {
  id: string;
  rowNumber: number;
  sku: string | null;
  product: { id: string; name: string; slug: string } | null;
  sourceUrl: string | null;
  fileName: string | null;
  role: string;
  position: number | null;
  altText: string | null;
  status: ItemStatus;
  attempts: number;
  lastError: string | null;
  duplicateOfMediaId: string | null;
  media: { width: number | null; height: number | null; bytes: number } | null;
  preview: string | null;
  publicUrl: string | null;
};
type Detail = Job & { items: Item[] };

const ITEM_TONE: Record<ItemStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent'> = {
  PENDING: 'accent', DOWNLOADING: 'accent', READY: 'info', DUPLICATE: 'warning', FAILED: 'danger', APPROVED: 'success', REJECTED: 'neutral',
};
const ITEM_LABEL: Record<ItemStatus, string> = {
  PENDING: 'Waiting', DOWNLOADING: 'Downloading', READY: 'Ready', DUPLICATE: 'Already have it', FAILED: 'Failed', APPROVED: 'Approved', REJECTED: 'Rejected',
};
const FILTERS: { value: '' | ItemStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'READY', label: 'Ready' },
  { value: 'DUPLICATE', label: 'Duplicates' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'PENDING', label: 'Waiting' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];
const CAN_APPROVE: ItemStatus[] = ['READY', 'DUPLICATE'];
const CAN_REJECT: ItemStatus[] = ['PENDING', 'READY', 'DUPLICATE', 'FAILED'];

export default function ImageImportPage() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const toast = useToast();
  const [filter, setFilter] = useState<'' | ItemStatus>('');
  const { data, error, reload } = useApi<Detail>(`/media-imports/${id}${filter ? `?status=${filter}` : ''}`);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  // Images are fetched in the background; refresh every 4 seconds until nothing is waiting.
  const processing = data?.status === 'PROCESSING';
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => void reload(), 4000);
    return () => clearInterval(t);
  }, [processing, reload]);

  // Drop selections that are no longer on screen (filter changed or status moved on).
  useEffect(() => {
    if (!data) return;
    const visible = new Set(data.items.map((i) => i.id));
    setSelected((s) => {
      const next = new Set([...s].filter((x) => visible.has(x)));
      return next.size === s.size ? s : next;
    });
  }, [data]);

  const chosen = useMemo(() => (data?.items ?? []).filter((i) => selected.has(i.id)), [data, selected]);
  const approvable = chosen.filter((i) => CAN_APPROVE.includes(i.status) && i.product);
  const rejectable = chosen.filter((i) => CAN_REJECT.includes(i.status));
  const retryable = chosen.filter((i) => i.status === 'FAILED');

  const act = async (action: 'approve' | 'reject' | 'retry', itemIds: string[]) => {
    setBusy(action);
    try {
      const r = await api<{ approved?: number; linked?: number; alreadyOnProduct?: number; rejected?: number; retried?: number; notRetryable?: number }>(`/media-imports/${id}/${action}`, { method: 'POST', json: { itemIds } });
      if (action === 'approve') toast(`${r.approved} approved: ${r.linked} added to products${r.alreadyOnProduct ? `, ${r.alreadyOnProduct} were already there` : ''}.`);
      if (action === 'reject') toast(`${r.rejected} rejected.`);
      if (action === 'retry') toast(`${r.retried} sent back to the queue${r.notRetryable ? `, ${r.notRetryable} can't be retried (unknown SKU or repeated row)` : ''}.`);
      setSelected(new Set());
      await reload();
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!data) return error ? <ErrorBox message={error} /> : <Loading />;

  const c = data.counts;
  const allVisibleSelected = data.items.length > 0 && data.items.every((i) => selected.has(i.id));
  const toggle = (itemId: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    return next;
  });

  return (
    <>
      <PageHeader
        title={data.name}
        back={{ href: '/media-imports', label: 'Image imports' }}
        description={<>From {data.source === 'MANUAL' ? 'a manual upload' : `a ${data.source} file`} · started {dateTime(data.createdAt)} by {data.createdByEmail ?? 'unknown'}</>}
        actions={
          <>
            <Badge tone={JOB_TONE[data.status]}>{JOB_LABEL[data.status]}</Badge>
            <a href={`/api/admin/media-imports/${id}/report.csv`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-[0.86rem] font-medium hover:border-ink">
              <Download className="h-4 w-4" /> Download report
            </a>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Total', countAll(c)],
          ['Waiting', (c.PENDING ?? 0) + (c.DOWNLOADING ?? 0)],
          ['To review', (c.READY ?? 0) + (c.DUPLICATE ?? 0)],
          ['Approved', c.APPROVED ?? 0],
          ['Failed', c.FAILED ?? 0],
          ['Rejected', c.REJECTED ?? 0],
        ].map(([label, n]) => (
          <div key={label} className="card grid gap-0.5 px-4 py-3">
            <span className="text-[0.72rem] font-medium uppercase tracking-[0.06em] text-muted">{label}</span>
            <span className="text-[1.4rem] font-semibold tabular">{n}</span>
          </div>
        ))}
      </div>

      <Card className="mb-5" title="Licence">
        <dl className="grid gap-2 text-[0.84rem] sm:grid-cols-[180px_1fr]">
          <dt className="text-muted">Owner or permission from</dt>
          <dd>{data.licenceSource}</dd>
          <dt className="text-muted">Details</dt>
          <dd className="whitespace-pre-line">{data.licenceNote}</dd>
        </dl>
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterTabs value={filter} onChange={(v) => setFilter(v as '' | ItemStatus)} options={FILTERS.map((f) => ({ ...f, count: f.value ? (f.value === 'PENDING' ? (c.PENDING ?? 0) + (c.DOWNLOADING ?? 0) : c[f.value] ?? 0) : countAll(c) }))} />
        {can('media.write') && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.8rem] text-muted">{selected.size} selected</span>
            {can('catalog.write') && (
              <Button size="sm" variant="primary" disabled={!approvable.length} loading={busy === 'approve'} onClick={() => act('approve', approvable.map((i) => i.id))}>
                <Check className="h-4 w-4" /> Approve {approvable.length || ''}
              </Button>
            )}
            <Button size="sm" variant="danger" disabled={!rejectable.length} loading={busy === 'reject'} onClick={() => act('reject', rejectable.map((i) => i.id))}>
              <X className="h-4 w-4" /> Reject {rejectable.length || ''}
            </Button>
            <Button size="sm" disabled={!retryable.length} loading={busy === 'retry'} onClick={() => act('retry', retryable.map((i) => i.id))}>
              <RotateCcw className="h-4 w-4" /> Retry {retryable.length || ''}
            </Button>
          </div>
        )}
      </div>

      <Card padded={false}>
        {data.items.length === 0 ? (
          <Empty title="No images here" body={filter ? 'Nothing has this status. Try another filter.' : 'This import has no rows.'} />
        ) : (
          <>
            {can('media.write') && (
              <label className="flex items-center gap-2 border-b border-line px-5 py-3 text-[0.82rem]">
                <input type="checkbox" className="h-4 w-4 accent-accent" checked={allVisibleSelected} onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(data.items.map((i) => i.id)))} />
                Select all shown ({data.items.length})
              </label>
            )}
            <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {data.items.map((i) => (
                <ItemCard key={i.id} item={i} selectable={can('media.write')} selected={selected.has(i.id)} onToggle={() => toggle(i.id)} />
              ))}
            </div>
          </>
        )}
      </Card>
      {data.items.length >= 1000 && <p className="mt-3 text-[0.8rem] text-muted">Showing the first 1,000 rows. Use the filter or the report for the rest.</p>}
    </>
  );
}

function ItemCard({ item: i, selectable, selected, onToggle }: { item: Item; selectable: boolean; selected: boolean; onToggle: () => void }) {
  const source = i.sourceUrl ?? i.fileName ?? '';
  return (
    <div className={clsx('grid content-start gap-2 rounded-lg border p-2 transition-colors', selected ? 'border-accent ring-2 ring-accent/25' : 'border-line')}>
      <button type="button" disabled={!selectable} onClick={onToggle} className="relative aspect-square overflow-hidden rounded-md bg-canvas disabled:cursor-default" aria-pressed={selected} aria-label={`Select row ${i.rowNumber}`}>
        {i.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/admin${i.preview}`} alt={i.altText ?? ''} loading="lazy" className="h-full w-full object-contain" />
        ) : (
          <span className="grid h-full place-items-center text-muted">
            {i.status === 'PENDING' || i.status === 'DOWNLOADING' ? <span className="text-[0.78rem]">Fetching…</span> : <ImageOff className="h-6 w-6" />}
          </span>
        )}
        {selectable && <input type="checkbox" tabIndex={-1} readOnly checked={selected} className="pointer-events-none absolute left-2 top-2 h-4 w-4 accent-accent" />}
        <span className="absolute right-2 top-2"><Badge tone={ITEM_TONE[i.status]}>{ITEM_LABEL[i.status]}</Badge></span>
      </button>
      <div className="grid gap-0.5 px-0.5 text-[0.76rem]">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono font-medium">{i.sku ?? '—'}</span>
          <span className="text-muted">Row {i.rowNumber}</span>
        </div>
        {i.product ? (
          <Link href={`/products/${i.product.id}`} className="truncate text-accent hover:underline">{i.product.name}</Link>
        ) : (
          <span className="text-danger">No product with this SKU</span>
        )}
        <span className="text-muted">
          {i.role.replace('_', ' ').toLowerCase()}
          {i.position ? ` · position ${i.position}` : ''}
          {i.media?.width ? ` · ${i.media.width}×${i.media.height}` : ''}
        </span>
        {source && <span className="truncate text-muted" title={source}>{source}</span>}
        {i.lastError && <span className={clsx('line-clamp-3', i.status === 'FAILED' ? 'text-danger' : 'text-muted')} title={i.lastError}>{i.lastError}{i.attempts > 1 ? ` (${i.attempts} tries)` : ''}</span>}
      </div>
    </div>
  );
}
