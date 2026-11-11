'use client';

import { useState } from 'react';
import { Badge, Card, ErrorBox, Loading, Modal, PageHeader, Pager, Table } from '@/components/ui';
import { dateTime, useApi } from '@/lib/api';

interface Entry {
  id: string;
  actorType: string;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}

export default function AuditPage() {
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), ...(actor ? { actor } : {}), ...(action ? { action } : {}), ...(entityType ? { entityType } : {}) });
  const { data, error } = useApi<{ items: Entry[]; page: number; pageCount: number; total: number }>(`/audit?${qs}`);
  const [sel, setSel] = useState<Entry | null>(null);

  return (
    <>
      <PageHeader title="Audit log" description="Every admin change, sign-in and view of customer details. Entries can’t be edited or deleted." />
      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <input value={actor} onChange={(e) => { setActor(e.target.value); setPage(1); }} placeholder="Staff email" aria-label="Filter by staff" className="h-10 w-56 rounded-lg border border-line-strong px-3 text-[0.86rem]" />
          <input value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} placeholder="Action, e.g. order. or refund." aria-label="Filter by action" className="h-10 w-56 rounded-lg border border-line-strong px-3 text-[0.86rem]" />
          <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-[0.86rem]" aria-label="Filter by type">
            <option value="">All types</option>
            {['Order', 'Product', 'Refund', 'ReturnRequest', 'Coupon', 'ContentPage', 'StaffUser', 'Role', 'Setting', 'User', 'Variant', 'MediaAsset', 'Pincode', 'Payment', 'Report'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <ErrorBox message={error} />
        {!data ? (
          <Loading />
        ) : (
          <>
            <Table
              rows={data.items}
              onRowClick={setSel}
              columns={[
                { key: 'w', label: 'When', render: (e) => <span className="whitespace-nowrap text-muted">{dateTime(e.createdAt)}</span> },
                { key: 'a', label: 'Who', render: (e) => e.actorEmail ?? <Badge>{e.actorType.toLowerCase()}</Badge> },
                { key: 'x', label: 'Action', render: (e) => <span className="font-mono text-[0.78rem]">{e.action}</span> },
                { key: 't', label: 'Record', render: (e) => <span className="text-[0.8rem]">{e.entityType}<span className="font-mono text-[0.72rem] text-muted"> {e.entityId?.slice(0, 8)}</span></span> },
                { key: 'i', label: 'IP', render: (e) => <span className="font-mono text-[0.74rem] text-muted">{e.ip}</span> },
              ]}
            />
            <Pager page={data.page} pageCount={data.pageCount} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <Modal open={sel !== null} onClose={() => setSel(null)} title={sel?.action ?? ''} wide>
        {sel && (
          <div className="grid gap-4 text-[0.84rem]">
            <p className="text-muted">{dateTime(sel.createdAt)} · {sel.actorEmail ?? sel.actorType} · {sel.ip} · {sel.entityType} {sel.entityId}</p>
            {sel.before !== null && sel.before !== undefined && (
              <div><p className="mb-1 font-semibold">Before</p><pre className="max-h-72 overflow-auto rounded-lg bg-canvas p-3 text-[0.74rem]">{JSON.stringify(sel.before, null, 2)}</pre></div>
            )}
            {sel.after !== null && sel.after !== undefined && (
              <div><p className="mb-1 font-semibold">After</p><pre className="max-h-72 overflow-auto rounded-lg bg-canvas p-3 text-[0.74rem]">{JSON.stringify(sel.after, null, 2)}</pre></div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
