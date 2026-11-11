'use client';

import clsx from 'clsx';
import { MousePointerClick, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { MediaPicker } from '@/components/MediaPicker';
import { ProductSearch } from '@/components/ProductSearch';
import { useCan } from '@/components/staff';
import { Button, Card, ErrorBox, Input, Loading, PageHeader, Select, StatusBadge, Textarea, useToast } from '@/components/ui';
import { api, message, useApi } from '@/lib/api';

interface Look {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageKey: string;
  image: { url: string };
  roomId: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  sort: number;
  hotspots: { productId: string; x: number; y: number; product: { id: string; name: string } }[];
}
type Pin = { productId: string; name: string; x: number; y: number };

/** Click the photo to drop a pin, then choose the product it points to. Drag pins to adjust. */
export default function LookEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const can = useCan();
  const toast = useToast();
  const { data, error } = useApi<Look>(`/looks/${id}`);
  const { data: rooms } = useApi<{ id: string; name: string }[]>('/rooms');
  const [l, setL] = useState<Look | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data) return;
    setL(structuredClone(data));
    setPins(data.hotspots.map((h) => ({ productId: h.productId, name: h.product.name, x: h.x, y: h.y })));
  }, [data]);

  if (error) return <ErrorBox message={error} />;
  if (!l) return <Loading rows={10} />;

  const pos = (e: React.PointerEvent | React.MouseEvent) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: Math.round(Math.min(98, Math.max(2, ((e.clientX - r.left) / r.width) * 100)) * 10) / 10, y: Math.round(Math.min(98, Math.max(2, ((e.clientY - r.top) / r.height) * 100)) * 10) / 10 };
  };

  const save = async () => {
    setBusy(true);
    try {
      await api(`/looks/${l.id}`, { method: 'PATCH', json: { name: l.name, slug: l.slug, description: l.description || null, imageKey: l.imageKey, roomId: l.roomId || null, status: l.status, sort: l.sort, hotspots: pins.map(({ productId, x, y }) => ({ productId, x, y })) } });
      toast('Look saved');
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader back={{ href: '/looks', label: 'Looks' }} title={<span className="flex items-center gap-3">{l.name} <StatusBadge status={l.status} label={l.status === 'ACTIVE' ? 'Live' : undefined} /></span>} actions={can('catalog.write') && <Button variant="primary" onClick={save} loading={busy}>Save</Button>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Scene" className="xl:col-span-2" actions={<Button size="sm" onClick={() => setPicking(true)}>Change photo</Button>}>
          <p className="mb-3 flex items-center gap-2 text-[0.8rem] text-muted"><MousePointerClick className="h-4 w-4" /> Click where a piece sits to add a pin. Drag pins to move them. Up to 12 pins.</p>
          <div
            ref={stage}
            className="relative cursor-crosshair select-none overflow-hidden rounded-lg"
            onClick={(e) => {
              if (!can('catalog.write') || (e.target as HTMLElement).closest('[data-pin]') || pins.length >= 12) return;
              setPending(pos(e));
            }}
            onPointerMove={(e) => {
              if (dragging === null) return;
              const p = pos(e);
              setPins((ps) => ps.map((x, i) => (i === dragging ? { ...x, ...p } : x)));
            }}
            onPointerUp={() => setDragging(null)}
            onPointerLeave={() => setDragging(null)}
          >
            <img src={l.image.url} alt="" className="w-full" draggable={false} />
            {pins.map((p, i) => (
              <button
                key={i}
                data-pin
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  setDragging(i);
                }}
                className="absolute grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-grab place-items-center rounded-[8px] border-2 border-white bg-ink/70 text-[0.75rem] font-bold text-white shadow-lg"
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                title={p.name}
                aria-label={`Pin ${i + 1}: ${p.name}`}
              >
                {i + 1}
              </button>
            ))}
            {pending && <span className="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-[8px] border-2 border-dashed border-white bg-accent/60" style={{ left: `${pending.x}%`, top: `${pending.y}%` }} />}
          </div>
          {pending && (
            <div className="mt-4 grid gap-2 rounded-lg border border-accent/30 bg-accent-soft p-4">
              <p className="text-[0.84rem] font-medium">Which product is at this pin?</p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <ProductSearch
                    exclude={pins.map((p) => p.productId)}
                    onPick={(prod) => {
                      setPins([...pins, { productId: prod.id, name: prod.name, x: pending.x, y: pending.y }]);
                      setPending(null);
                    }}
                  />
                </div>
                <Button onClick={() => setPending(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </Card>
        <div className="grid content-start gap-6">
          <Card title={`Pins (${pins.length})`} padded={false}>
            {pins.length === 0 ? (
              <p className="p-5 text-[0.84rem] text-muted">No pins yet.</p>
            ) : (
              <ol className="divide-y divide-line">
                {pins.map((p, i) => (
                  <li key={i} className={clsx('flex items-center gap-3 px-5 py-2.5 text-[0.84rem]')}>
                    <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-[0.7rem] font-bold text-white">{i + 1}</span>
                    <span className="flex-1">{p.name}</span>
                    <button type="button" onClick={() => setPins(pins.filter((_, j) => j !== i))} className="text-muted hover:text-danger" aria-label={`Remove pin ${i + 1}`}><X className="h-4 w-4" /></button>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card title="Details">
            <fieldset disabled={!can('catalog.write')} className="grid gap-4">
              <Input label="Name" value={l.name} onChange={(e) => setL({ ...l, name: e.target.value })} />
              <Input label="URL slug" value={l.slug} onChange={(e) => setL({ ...l, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} />
              <Textarea label="Description" value={l.description ?? ''} onChange={(e) => setL({ ...l, description: e.target.value })} />
              <Select label="Room" value={l.roomId ?? ''} onChange={(e) => setL({ ...l, roomId: e.target.value || null })} options={[{ value: '', label: 'No room' }, ...(rooms ?? []).map((r) => ({ value: r.id, label: r.name }))]} />
              <Select label="Status" value={l.status} onChange={(e) => setL({ ...l, status: e.target.value as Look['status'] })} options={[{ value: 'DRAFT', label: 'Draft (hidden)' }, { value: 'ACTIVE', label: 'Live' }, { value: 'ARCHIVED', label: 'Archived' }]} />
              <Button
                variant="danger"
                type="button"
                onClick={async () => {
                  try {
                    await api(`/looks/${l.id}`, { method: 'DELETE' });
                    toast('Look deleted');
                    router.push('/looks');
                  } catch (err) {
                    toast(message(err), 'error');
                  }
                }}
              >
                Delete look
              </Button>
            </fieldset>
          </Card>
        </div>
      </div>
      <MediaPicker open={picking} onClose={() => setPicking(false)} onSelect={(a) => setL({ ...l, imageKey: a.storageKey, image: { url: a.url } })} />
    </>
  );
}
