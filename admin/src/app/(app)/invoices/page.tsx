'use client';

import { FileDown, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Card, ErrorBox, Loading, PageHeader, Pager, Table } from '@/components/ui';
import { date, inr, useApi } from '@/lib/api';

interface Row {
  id: string;
  number: string;
  fy: string;
  issuedAt: string;
  order: { id: string; orderNumber: string; name: string; grandTotal: number; status: string };
  taxable: number;
  tax: number;
  intraState: boolean;
  placeOfSupply: string;
}

export default function InvoicesPage() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, error } = useApi<{ items: Row[]; page: number; pageCount: number; total: number }>(`/invoices?page=${page}${search ? `&q=${encodeURIComponent(search)}` : ''}`);
  return (
    <>
      <PageHeader title="Invoices" description="GST tax invoices, numbered in sequence for each financial year. One is issued when an order is confirmed." />
      <Card padded={false}>
        <form className="relative border-b border-line p-4" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q); }}>
          <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice or order number" aria-label="Search invoices" className="h-10 w-full max-w-md rounded-lg border border-line-strong pl-9 pr-3 text-[0.86rem]" />
        </form>
        <ErrorBox message={error} />
        {!data ? (
          <Loading />
        ) : (
          <>
            <Table
              rows={data.items}
              columns={[
                { key: 'n', label: 'Invoice', render: (r) => <span className="font-mono font-semibold">{r.number}</span> },
                { key: 'd', label: 'Date', render: (r) => date(r.issuedAt) },
                { key: 'o', label: 'Order', render: (r) => <div><Link href={`/orders/${r.order.id}`} className="hover:text-accent">{r.order.orderNumber}</Link><p className="text-[0.76rem] text-muted">{r.order.name}</p></div> },
                { key: 'p', label: 'Place of supply', render: (r) => <div className="flex items-center gap-2">{r.placeOfSupply}<Badge tone={r.intraState ? 'accent' : 'info'}>{r.intraState ? 'CGST + SGST' : 'IGST'}</Badge></div> },
                { key: 't', label: 'Taxable', className: 'text-right', render: (r) => <span className="tabular">{inr(r.taxable)}</span> },
                { key: 'g', label: 'GST', className: 'text-right', render: (r) => <span className="tabular">{inr(r.tax)}</span> },
                { key: 'v', label: 'Total', className: 'text-right', render: (r) => <span className="font-semibold tabular">{inr(r.order.grandTotal)}</span> },
                { key: 'x', label: '', className: 'text-right', render: (r) => <a href={`/api/admin/orders/${r.order.id}/invoice`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[0.8rem] text-accent hover:underline"><FileDown className="h-4 w-4" /> PDF</a> },
              ]}
              empty={<p className="p-10 text-center text-muted">No invoices yet. They’re issued when orders are confirmed.</p>}
            />
            <Pager page={data.page} pageCount={data.pageCount} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
