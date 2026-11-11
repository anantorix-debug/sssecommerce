'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Badge, Card, ErrorBox, FilterTabs, Loading, PageHeader, Pager, StatusBadge, Table } from '@/components/ui';
import { date, inr, useApi } from '@/lib/api';

interface Row {
  id: string;
  returnNumber: string;
  status: string;
  statusLabel: string;
  reason: string;
  createdAt: string;
  order: { orderNumber: string; name: string; paymentMethod: string };
  items: string[];
  value: number;
}

function Returns() {
  const router = useRouter();
  const status = useSearchParams().get('status') ?? '';
  const [page, setPage] = useState(1);
  const { data, error } = useApi<{ items: Row[]; page: number; pageCount: number; total: number }>(`/returns?page=${page}${status ? `&status=${status}` : ''}`);
  return (
    <>
      <PageHeader title="Returns" description="Review requests, schedule pickups, inspect what comes back, and refund." />
      <div className="mb-4">
        <FilterTabs
          value={status}
          onChange={(v) => {
            setPage(1);
            router.replace(v ? `/returns?status=${v}` : '/returns');
          }}
          options={[
            { value: '', label: 'All' },
            { value: 'REQUESTED', label: 'To review' },
            { value: 'PICKUP_SCHEDULED', label: 'Pickup scheduled' },
            { value: 'RECEIVED', label: 'To inspect' },
            { value: 'INSPECTED', label: 'To refund' },
            { value: 'REFUNDED,CLOSED', label: 'Done' },
            { value: 'REJECTED', label: 'Rejected' },
          ]}
        />
      </div>
      <Card padded={false}>
        <ErrorBox message={error} />
        {!data ? (
          <Loading />
        ) : (
          <>
            <Table
              rows={data.items}
              rowHref={(r) => `/returns/${r.id}`}
              columns={[
                { key: 'n', label: 'Return', render: (r) => <Link href={`/returns/${r.id}`} className="font-semibold hover:text-accent">{r.returnNumber}</Link> },
                { key: 'd', label: 'Requested', render: (r) => date(r.createdAt) },
                { key: 'o', label: 'Order', render: (r) => <div><p>{r.order.orderNumber}</p><p className="text-[0.76rem] text-muted">{r.order.name}</p></div> },
                { key: 'i', label: 'Items', render: (r) => <span className="text-[0.8rem]">{r.items.join(', ')}</span> },
                { key: 'r', label: 'Reason', render: (r) => <span className="text-[0.8rem]">{r.reason}</span> },
                { key: 'p', label: 'Paid by', render: (r) => <Badge tone={r.order.paymentMethod === 'COD' ? 'warning' : 'info'}>{r.order.paymentMethod === 'COD' ? 'COD' : 'Online'}</Badge> },
                { key: 's', label: 'Status', render: (r) => <StatusBadge status={r.status} label={r.statusLabel} /> },
                { key: 'v', label: 'Value', className: 'text-right', render: (r) => <span className="tabular">{inr(r.value)}</span> },
              ]}
              empty={<p className="p-10 text-center text-muted">No returns here.</p>}
            />
            <Pager page={data.page} pageCount={data.pageCount} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

export default function ReturnsPage() {
  return (
    <Suspense>
      <Returns />
    </Suspense>
  );
}
