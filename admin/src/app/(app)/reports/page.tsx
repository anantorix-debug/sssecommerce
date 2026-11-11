'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';
import { useCan } from '@/components/staff';
import { Card, ErrorBox, Input, Loading, PageHeader, Stat, Table } from '@/components/ui';
import { inr, useApi } from '@/lib/api';

interface Report {
  items: { date: string; orders: number; units: number; gross: number; discount: number; delivery: number; tax: number; net: number }[];
  totals: { orders: number; units: number; gross: number; discount: number; delivery: number; tax: number; net: number; refunds: number };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function ReportsPage() {
  const can = useCan();
  const today = new Date();
  const [from, setFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(iso(today));
  const { data, error } = useApi<Report>(`/reports/sales?from=${from}&to=${to}`);
  const presets = [
    { label: 'This month', from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) },
    { label: 'Last month', from: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: iso(new Date(today.getFullYear(), today.getMonth(), 0)) },
    { label: 'Last 90 days', from: iso(new Date(today.getTime() - 89 * 86_400_000)), to: iso(today) },
    { label: 'This financial year', from: iso(new Date(today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1, 3, 1)), to: iso(today) },
  ];

  return (
    <>
      <PageHeader
        title="Sales report"
        description="Confirmed orders by the day they were confirmed (India time). Cancelled and unpaid orders are excluded. Amounts include GST."
        actions={
          can('reports.export') && (
            <a href={`/api/admin/reports/sales.csv?from=${from}&to=${to}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-[0.86rem] font-medium hover:border-ink">
              <Download className="h-4 w-4" /> Download CSV
            </a>
          )
        }
      />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <Input label="From" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button key={p.label} onClick={() => { setFrom(p.from); setTo(p.to); }} className={`h-10 rounded-lg px-3 text-[0.8rem] ${from === p.from && to === p.to ? 'bg-ink text-white' : 'text-muted hover:bg-ink/[0.05]'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <ErrorBox message={error} />
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Net sales" value={inr(data.totals.net)} />
            <Stat label="Orders" value={data.totals.orders} sub={`${data.totals.units} units`} />
            <Stat label="Average order" value={data.totals.orders ? inr(Math.round(data.totals.net / data.totals.orders)) : '—'} />
            <Stat label="GST included" value={inr(data.totals.tax)} />
            <Stat label="Refunded" value={inr(data.totals.refunds)} sub={`Discounts given ${inr(data.totals.discount)}`} />
          </div>
          <Card padded={false}>
            <Table
              rows={data.items}
              columns={[
                { key: 'd', label: 'Date', render: (r) => new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) },
                { key: 'o', label: 'Orders', className: 'text-right', render: (r) => <span className="tabular">{r.orders}</span> },
                { key: 'u', label: 'Units', className: 'text-right', render: (r) => <span className="tabular">{r.units}</span> },
                { key: 'g', label: 'Gross', className: 'text-right', render: (r) => <span className="tabular">{inr(r.gross)}</span> },
                { key: 'x', label: 'Discounts', className: 'text-right', render: (r) => <span className="tabular text-muted">{r.discount ? `−${inr(r.discount)}` : '—'}</span> },
                { key: 'v', label: 'Delivery', className: 'text-right', render: (r) => <span className="tabular text-muted">{inr(r.delivery)}</span> },
                { key: 't', label: 'GST incl.', className: 'text-right', render: (r) => <span className="tabular text-muted">{inr(r.tax)}</span> },
                { key: 'n', label: 'Net', className: 'text-right', render: (r) => <span className="font-semibold tabular">{inr(r.net)}</span> },
              ]}
              empty={<p className="p-10 text-center text-muted">No confirmed orders in this period.</p>}
            />
          </Card>
        </>
      )}
    </>
  );
}
