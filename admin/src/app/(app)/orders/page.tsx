'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Badge, Card, ErrorBox, FilterTabs, Loading, PageHeader, Pager, StatusBadge, Table } from '@/components/ui';
import { dateTime, inr, useApi } from '@/lib/api';

interface Row {
  id: string;
  orderNumber: string;
  placedAt: string;
  name: string;
  email: string;
  phone: string;
  city?: string;
  status: string;
  statusLabel: string;
  paymentMethod: 'ONLINE' | 'COD';
  paymentStatus: string | null;
  total: number;
  itemCount: number;
  slot: string | null;
}

const TABS = [
  { value: '', label: 'All' },
  { value: 'PENDING_CONFIRMATION', label: 'COD to confirm' },
  { value: 'CONFIRMED', label: 'To prepare' },
  { value: 'PROCESSING', label: 'To dispatch' },
  { value: 'SHIPPED', label: 'Out for delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'PENDING_PAYMENT', label: 'Awaiting payment' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function Orders() {
  const router = useRouter();
  const params = useSearchParams();
  const status = params.get('status') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [method, setMethod] = useState(params.get('method') ?? '');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [status, method]);

  const query = new URLSearchParams({ page: String(page), ...(status ? { status } : {}), ...(method ? { method } : {}), ...(params.get('q') ? { q: params.get('q')! } : {}) });
  const { data, error } = useApi<{ items: Row[]; total: number; page: number; pageCount: number }>(`/orders?${query}`);

  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    router.replace(`/orders${next.toString() ? `?${next}` : ''}`);
  };

  return (
    <>
      <PageHeader title="Orders" description="Every order, newest first. Open one to confirm, dispatch, deliver, cancel or refund it." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterTabs value={TABS.some((t) => t.value === status) ? status : ''} onChange={(v) => go({ status: v })} options={TABS} />
      </div>
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <form
            className="relative min-w-60 flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              go({ q });
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order number, name, email or phone" aria-label="Search orders" className="h-10 w-full rounded-lg border border-line-strong pl-9 pr-3 text-[0.86rem]" />
          </form>
          <select value={method} onChange={(e) => { setMethod(e.target.value); go({ method: e.target.value }); }} className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-[0.86rem]" aria-label="Payment method">
            <option value="">All payments</option>
            <option value="ONLINE">Online</option>
            <option value="COD">Cash on delivery</option>
          </select>
        </div>
        <ErrorBox message={error} />
        {!data ? (
          <Loading />
        ) : (
          <>
            <Table
              rows={data.items}
              rowHref={(r) => `/orders/${r.id}`}
              columns={[
                { key: 'num', label: 'Order', render: (r) => <Link href={`/orders/${r.id}`} className="font-semibold hover:text-accent">{r.orderNumber}</Link> },
                { key: 'date', label: 'Placed', render: (r) => <span className="text-muted">{dateTime(r.placedAt)}</span> },
                { key: 'cust', label: 'Customer', render: (r) => <div><p>{r.name}</p><p className="text-[0.76rem] text-muted">{r.city} · {r.phone}</p></div> },
                { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} label={r.statusLabel} /> },
                { key: 'pay', label: 'Payment', render: (r) => <div className="flex items-center gap-1.5"><Badge tone={r.paymentMethod === 'COD' ? 'warning' : 'info'}>{r.paymentMethod === 'COD' ? 'COD' : 'Online'}</Badge>{r.paymentStatus && <span className="text-[0.74rem] text-muted">{r.paymentStatus.replace(/_/g, ' ').toLowerCase()}</span>}</div> },
                { key: 'slot', label: 'Delivery slot', render: (r) => <span className="text-[0.8rem] text-muted">{r.slot ?? '—'}</span> },
                { key: 'total', label: 'Total', className: 'text-right', render: (r) => <span className="tabular">{inr(r.total)}</span> },
              ]}
              empty={<p className="p-10 text-center text-muted">No orders match.</p>}
            />
            <Pager page={data.page} pageCount={data.pageCount} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense>
      <Orders />
    </Suspense>
  );
}
