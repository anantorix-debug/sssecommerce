'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, ErrorBox, FilterTabs, Input, Loading, Modal, PageHeader, Stat, StatusBadge, Table, useToast } from '@/components/ui';
import { api, date, inr, message, useApi } from '@/lib/api';

interface Row {
  id: string;
  orderNumber: string;
  name: string;
  phone: string;
  deliveredAt: string | null;
  total: number;
  payment: { id: string; status: string; collectedAt: string | null; collectedBy: string | null } | null;
}

export default function CodPage() {
  const toast = useToast();
  const [state, setState] = useState('uncollected');
  const { data, error, reload } = useApi<{ totals: { status: string; amount: number; count: number }[]; items: Row[] }>(`/cod?state=${state}`);
  const [target, setTarget] = useState<Row | null>(null);
  const [by, setBy] = useState('');
  const [busy, setBusy] = useState(false);

  const total = (s: string) => data?.totals.find((t) => t.status === s);

  return (
    <>
      <PageHeader title="Cash on delivery" description="Record cash once the delivery team hands it in. Every delivered COD order should end up collected." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Stat label="Delivered, cash not recorded" value={inr(total('PENDING_COLLECTION')?.amount ?? 0)} sub={`${total('PENDING_COLLECTION')?.count ?? 0} orders`} tone={(total('PENDING_COLLECTION')?.count ?? 0) > 0 ? 'down' : undefined} />
        <Stat label="Collected" value={inr(total('COLLECTED')?.amount ?? 0)} sub={`${total('COLLECTED')?.count ?? 0} orders`} />
      </div>
      <div className="mb-4">
        <FilterTabs value={state} onChange={setState} options={[{ value: 'uncollected', label: 'To record' }, { value: 'collected', label: 'Collected' }, { value: 'all', label: 'All' }]} />
      </div>
      <Card padded={false}>
        <ErrorBox message={error} />
        {!data ? (
          <Loading />
        ) : (
          <Table
            rows={data.items}
            columns={[
              { key: 'o', label: 'Order', render: (r) => <Link href={`/orders/${r.id}`} className="font-semibold hover:text-accent">{r.orderNumber}</Link> },
              { key: 'c', label: 'Customer', render: (r) => <div><p>{r.name}</p><p className="text-[0.76rem] text-muted">{r.phone}</p></div> },
              { key: 'd', label: 'Delivered', render: (r) => (r.deliveredAt ? date(r.deliveredAt) : '—') },
              { key: 't', label: 'Amount', className: 'text-right', render: (r) => <span className="tabular">{inr(r.total)}</span> },
              { key: 's', label: 'Status', render: (r) => (r.payment ? <StatusBadge status={r.payment.status} label={r.payment.status === 'COLLECTED' ? `Collected by ${r.payment.collectedBy}` : 'Not recorded'} /> : '—') },
              {
                key: 'a',
                label: '',
                className: 'text-right',
                render: (r) =>
                  r.payment?.status === 'PENDING_COLLECTION' ? (
                    <Button size="sm" variant="primary" onClick={() => setTarget(r)}>
                      Record cash
                    </Button>
                  ) : null,
              },
            ]}
            empty={<p className="p-10 text-center text-muted">{state === 'uncollected' ? 'All delivered COD orders have their cash recorded.' : 'Nothing here.'}</p>}
          />
        )}
      </Card>
      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title={`Record cash for ${target?.orderNumber ?? ''}`}
        footer={
          <>
            <Button onClick={() => setTarget(null)}>Back</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={by.trim().length < 2}
              onClick={async () => {
                if (!target?.payment) return;
                setBusy(true);
                try {
                  await api(`/cod/${target.payment.id}/collect`, { method: 'POST', json: { amount: target.total, collectedBy: by } });
                  toast(`${inr(target.total)} recorded for ${target.orderNumber}`);
                  setTarget(null);
                  setBy('');
                  void reload();
                } catch (err) {
                  toast(message(err), 'error');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Record {target ? inr(target.total) : ''}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <p className="text-[0.86rem] text-ink-soft">Record the full order amount of {target ? inr(target.total) : ''}. If the customer paid less, add a note on the order instead and speak to finance.</p>
          <Input label="Collected by" value={by} onChange={(e) => setBy(e.target.value)} placeholder="Delivery team member’s name" />
        </div>
      </Modal>
    </>
  );
}
