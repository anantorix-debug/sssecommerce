'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useCan } from '@/components/staff';
import { Badge, Button, Card, ErrorBox, FilterTabs, Input, Loading, Modal, PageHeader, Pager, Select, Table, useToast } from '@/components/ui';
import { api, message, useApi } from '@/lib/api';

interface Row {
  variantId: string;
  productId: string;
  product: string;
  productStatus: string;
  sku: string;
  title: string;
  active: boolean;
  onHand: number;
  reserved: number;
  available: number;
  low: boolean;
  locations: { locationId: string; name: string; onHand: number; reserved: number }[];
}

const REASONS = ['Count correction', 'Damaged in warehouse', 'Used as display sample', 'Returned to supplier', 'Found in stock', 'Other'];

function Inventory() {
  const can = useCan();
  const toast = useToast();
  const params = useSearchParams();
  const [low, setLow] = useState(params.get('low') ?? '');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, reload } = useApi<{ items: Row[]; page: number; pageCount: number; total: number }>(`/inventory?page=${page}${low ? '&low=1' : ''}${search ? `&q=${encodeURIComponent(search)}` : ''}`);
  const { data: locations } = useApi<{ id: string; name: string; isActive: boolean }[]>('/locations');
  const [target, setTarget] = useState<Row | null>(null);
  const [form, setForm] = useState({ type: 'RECEIPT' as 'RECEIPT' | 'ADJUSTMENT', locationId: '', quantity: '', reason: 'Purchase received', reference: '' });
  const [busy, setBusy] = useState(false);

  const open = (r: Row, type: 'RECEIPT' | 'ADJUSTMENT') => {
    setTarget(r);
    setForm({ type, locationId: locations?.find((l) => l.isActive)?.id ?? '', quantity: '', reason: type === 'RECEIPT' ? 'Purchase received' : REASONS[0], reference: '' });
  };

  return (
    <>
      <PageHeader title="Inventory" description="Available = on hand minus units held for orders awaiting payment or dispatch. Every change is recorded in stock history." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterTabs value={low} onChange={(v) => { setLow(v); setPage(1); }} options={[{ value: '', label: 'All variants' }, { value: '1', label: 'Low stock' }]} />
        <form className="relative min-w-60 flex-1" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product or SKU" aria-label="Search inventory" className="h-10 w-full max-w-md rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-[0.86rem]" />
        </form>
      </div>
      <Card padded={false}>
        <ErrorBox message={error} />
        {!data ? (
          <Loading />
        ) : (
          <>
            <Table
              rows={data.items}
              columns={[
                { key: 'p', label: 'Variant', render: (r) => <div><Link href={`/products/${r.productId}`} className="font-medium hover:text-accent">{r.product}</Link><p className="text-[0.76rem] text-muted">{r.title} · <span className="font-mono">{r.sku}</span>{!r.active && ' · not on sale'}</p></div> },
                { key: 'l', label: 'By location', render: (r) => <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.76rem] text-muted">{r.locations.map((l) => <span key={l.locationId}>{l.name.replace(' warehouse', '')}: <span className="text-ink tabular">{l.onHand}</span></span>)}</div> },
                { key: 'h', label: 'On hand', className: 'text-right', render: (r) => <span className="tabular">{r.onHand}</span> },
                { key: 'r', label: 'Held', className: 'text-right', render: (r) => <span className="tabular text-muted">{r.reserved}</span> },
                { key: 'a', label: 'Available', className: 'text-right', render: (r) => (r.available <= 0 ? <Badge tone="danger">0</Badge> : r.low ? <Badge tone="warning">{r.available}</Badge> : <span className="font-semibold tabular">{r.available}</span>) },
                {
                  key: 'x',
                  label: '',
                  className: 'text-right whitespace-nowrap',
                  render: (r) =>
                    can('inventory.write') && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" onClick={() => open(r, 'RECEIPT')}>Stock in</Button>
                        <Button size="sm" variant="ghost" onClick={() => open(r, 'ADJUSTMENT')}>Adjust</Button>
                        <Link href={`/inventory/movements?variantId=${r.variantId}`} className="inline-flex h-8 items-center px-2 text-[0.78rem] text-muted hover:text-ink">History</Link>
                      </div>
                    ),
                },
              ]}
              empty={<p className="p-10 text-center text-muted">{low ? 'Nothing is running low.' : 'No variants match.'}</p>}
            />
            <Pager page={data.page} pageCount={data.pageCount} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title={form.type === 'RECEIPT' ? 'Receive stock' : 'Adjust stock'}
        footer={
          <>
            <Button onClick={() => setTarget(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!form.locationId || !form.quantity || Number(form.quantity) === 0 || form.reason.trim().length < 3}
              onClick={async () => {
                if (!target) return;
                setBusy(true);
                try {
                  await api('/stock-movements', { method: 'POST', json: { variantId: target.variantId, locationId: form.locationId, type: form.type, quantity: Number(form.quantity), reason: form.reason, reference: form.reference || undefined } });
                  toast(`Stock updated for ${target.sku}`);
                  setTarget(null);
                  void reload();
                } catch (err) {
                  toast(message(err), 'error');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {target && (
          <div className="grid gap-4">
            <p className="text-[0.86rem]">
              <span className="font-medium">{target.product}</span> · {target.title} · {target.available} available now
            </p>
            <Select label="Location" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} options={(locations ?? []).filter((l) => l.isActive).map((l) => ({ value: l.id, label: l.name }))} />
            <Input
              label={form.type === 'RECEIPT' ? 'Units received' : 'Change (use a minus sign to remove, e.g. -2)'}
              inputMode="numeric"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: form.type === 'RECEIPT' ? e.target.value.replace(/\D/g, '') : e.target.value.replace(/[^\d-]/g, '') })}
            />
            {form.type === 'ADJUSTMENT' ? (
              <Select label="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} options={REASONS.map((r) => ({ value: r, label: r }))} />
            ) : (
              <Input label="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            )}
            <Input label="Reference (optional)" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder={form.type === 'RECEIPT' ? 'Purchase order or invoice number' : 'Count sheet, ticket number…'} />
          </div>
        )}
      </Modal>
    </>
  );
}

export default function InventoryPage() {
  return (
    <Suspense>
      <Inventory />
    </Suspense>
  );
}
