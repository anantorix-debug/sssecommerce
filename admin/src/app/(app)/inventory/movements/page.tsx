'use client';

import clsx from 'clsx';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Badge, Card, ErrorBox, Loading, PageHeader, Pager, Table } from '@/components/ui';
import { dateTime, useApi } from '@/lib/api';

interface Move {
  id: string;
  type: string;
  quantity: number;
  reason: string | null;
  reference: string | null;
  createdAt: string;
  product?: string;
  sku?: string;
  variant?: string;
  location?: string;
  actor: string;
}

const TYPE: Record<string, { label: string; tone: 'success' | 'info' | 'warning' | 'neutral' | 'accent' }> = {
  RECEIPT: { label: 'Received', tone: 'success' },
  SALE: { label: 'Sold', tone: 'info' },
  ADJUSTMENT: { label: 'Adjusted', tone: 'warning' },
  CANCEL_RESTOCK: { label: 'Cancelled order', tone: 'neutral' },
  RETURN_RESTOCK: { label: 'Returned', tone: 'accent' },
};

function Movements() {
  const variantId = useSearchParams().get('variantId');
  const [page, setPage] = useState(1);
  const { data, error } = useApi<{ items: Move[]; page: number; pageCount: number; total: number }>(`/stock-movements?page=${page}${variantId ? `&variantId=${variantId}` : ''}`);
  return (
    <>
      <PageHeader back={{ href: '/inventory', label: 'Inventory' }} title="Stock history" description={variantId && data?.items[0] ? `${data.items[0].product} · ${data.items[0].variant}` : 'Every change to stock, newest first. Entries can’t be edited or deleted.'} />
      <Card padded={false}>
        <ErrorBox message={error} />
        {!data ? (
          <Loading />
        ) : (
          <>
            <Table
              rows={data.items}
              columns={[
                { key: 'd', label: 'When', render: (m) => <span className="text-muted">{dateTime(m.createdAt)}</span> },
                { key: 't', label: 'Type', render: (m) => <Badge tone={TYPE[m.type]?.tone ?? 'neutral'}>{TYPE[m.type]?.label ?? m.type}</Badge> },
                { key: 'p', label: 'Variant', render: (m) => <div><p>{m.product}</p><p className="font-mono text-[0.72rem] text-muted">{m.sku}</p></div> },
                { key: 'l', label: 'Location', render: (m) => m.location },
                { key: 'q', label: 'Change', className: 'text-right', render: (m) => <span className={clsx('font-semibold tabular', m.quantity > 0 ? 'text-success' : 'text-danger')}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</span> },
                { key: 'r', label: 'Reason', render: (m) => <div className="text-[0.8rem]"><p>{m.reason ?? '—'}</p>{m.reference && <p className="text-muted">{m.reference}</p>}</div> },
                { key: 'a', label: 'By', render: (m) => <span className="text-[0.8rem] text-muted">{m.actor}</span> },
              ]}
              empty={<p className="p-10 text-center text-muted">No stock changes yet.</p>}
            />
            <Pager page={data.page} pageCount={data.pageCount} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

export default function MovementsPage() {
  return (
    <Suspense>
      <Movements />
    </Suspense>
  );
}
