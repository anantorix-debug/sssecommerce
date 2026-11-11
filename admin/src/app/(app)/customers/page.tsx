'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Card, ErrorBox, Loading, PageHeader, Pager, Table } from '@/components/ui';
import { date, inr, useApi } from '@/lib/api';

interface Row {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  createdAt: string;
  orders: number;
  spent: number;
  lastOrderAt: string | null;
}

export default function CustomersPage() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, error } = useApi<{ items: Row[]; page: number; pageCount: number; total: number }>(`/customers?page=${page}${search ? `&q=${encodeURIComponent(search)}` : ''}`);
  return (
    <>
      <PageHeader title="Customers" description="People with an account. Guest orders are listed under Orders." />
      <Card padded={false}>
        <form
          className="relative border-b border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(q);
          }}
        >
          <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or phone" aria-label="Search customers" className="h-10 w-full max-w-md rounded-lg border border-line-strong pl-9 pr-3 text-[0.86rem]" />
        </form>
        <ErrorBox message={error} />
        {!data ? (
          <Loading />
        ) : (
          <>
            <Table
              rows={data.items}
              rowHref={(r) => `/customers/${r.id}`}
              columns={[
                { key: 'n', label: 'Customer', render: (r) => <Link href={`/customers/${r.id}`} className="font-medium hover:text-accent">{r.name ?? r.email}</Link> },
                { key: 'e', label: 'Contact', render: (r) => <div><p className="text-[0.84rem]">{r.email}</p><p className="text-[0.76rem] text-muted">{r.phone ?? '—'}</p></div> },
                { key: 'j', label: 'Joined', render: (r) => date(r.createdAt) },
                { key: 'o', label: 'Orders', className: 'text-right', render: (r) => <span className="tabular">{r.orders}</span> },
                { key: 's', label: 'Spent', className: 'text-right', render: (r) => <span className="tabular">{inr(r.spent)}</span> },
                { key: 'l', label: 'Last order', render: (r) => (r.lastOrderAt ? date(r.lastOrderAt) : '—') },
              ]}
              empty={<p className="p-10 text-center text-muted">No customers found.</p>}
            />
            <Pager page={data.page} pageCount={data.pageCount} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
