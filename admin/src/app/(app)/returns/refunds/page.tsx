'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, ErrorBox, FilterTabs, Input, Loading, Modal, PageHeader, StatusBadge, Table, useToast } from '@/components/ui';
import { api, dateTime, inr, message, useApi } from '@/lib/api';

interface Refund {
  id: string;
  amount: number;
  reason: string;
  method: 'ORIGINAL' | 'BANK_TRANSFER' | 'UPI';
  status: string;
  reference: string | null;
  payoutDetails: string | null;
  createdAt: string;
  order: { id: string; orderNumber: string; name: string; paymentMethod: string };
  returnRequest: { returnNumber: string } | null;
}

export default function RefundsPage() {
  const toast = useToast();
  const [status, setStatus] = useState('REQUESTED');
  const { data, error, reload } = useApi<Refund[]>(`/refunds${status ? `?status=${status}` : ''}`);
  const [target, setTarget] = useState<Refund | null>(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok);
      setTarget(null);
      setReference('');
      void reload();
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Refunds" description="Online refunds go back through Razorpay. Cash-on-delivery refunds are paid by bank transfer or UPI, then recorded here with the transaction reference." />
      <div className="mb-4">
        <FilterTabs value={status} onChange={setStatus} options={[{ value: 'REQUESTED', label: 'To process' }, { value: 'PROCESSING', label: 'In progress' }, { value: 'FAILED', label: 'Failed' }, { value: 'PROCESSED', label: 'Processed' }, { value: '', label: 'All' }]} />
      </div>
      <Card padded={false}>
        <ErrorBox message={error} />
        {!data ? (
          <Loading />
        ) : (
          <Table
            rows={data}
            columns={[
              { key: 'd', label: 'Requested', render: (r) => dateTime(r.createdAt) },
              { key: 'o', label: 'Order', render: (r) => <div><Link href={`/orders/${r.order.id}`} className="font-semibold hover:text-accent">{r.order.orderNumber}</Link><p className="text-[0.76rem] text-muted">{r.order.name}{r.returnRequest ? ` · ${r.returnRequest.returnNumber}` : ''}</p></div> },
              { key: 'r', label: 'Reason', render: (r) => <span className="text-[0.8rem]">{r.reason}</span> },
              { key: 'm', label: 'Method', render: (r) => <span className="text-[0.8rem]">{r.method === 'ORIGINAL' ? 'Razorpay' : r.method === 'UPI' ? 'UPI' : 'Bank transfer'}</span> },
              { key: 'a', label: 'Amount', className: 'text-right', render: (r) => <span className="tabular">{inr(r.amount)}</span> },
              { key: 's', label: 'Status', render: (r) => <div><StatusBadge status={r.status} />{r.reference && <p className="text-[0.72rem] text-muted">Ref {r.reference}</p>}</div> },
              {
                key: 'x',
                label: '',
                className: 'text-right',
                render: (r) =>
                  r.status === 'REQUESTED' || r.status === 'FAILED' ? (
                    <Button size="sm" variant="primary" onClick={() => setTarget(r)}>
                      {r.method === 'ORIGINAL' ? 'Send refund' : 'Record payout'}
                    </Button>
                  ) : null,
              },
            ]}
            empty={<p className="p-10 text-center text-muted">No refunds here.</p>}
          />
        )}
      </Card>
      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title={`Refund ${target ? inr(target.amount) : ''} for ${target?.order.orderNumber ?? ''}`}
        footer={
          target && (
            <>
              <Button variant="danger" loading={busy} onClick={() => act(() => api(`/refunds/${target.id}/reject`, { method: 'POST' }), 'Refund rejected')}>
                Reject
              </Button>
              <Button
                variant="primary"
                loading={busy}
                disabled={target.method !== 'ORIGINAL' && reference.trim().length < 4}
                onClick={() => act(() => api(`/refunds/${target.id}/process`, { method: 'POST', json: target.method === 'ORIGINAL' ? {} : { reference } }), target.method === 'ORIGINAL' ? 'Refund sent to Razorpay' : 'Payout recorded and customer emailed')}
              >
                {target.method === 'ORIGINAL' ? 'Send via Razorpay' : 'Mark as paid'}
              </Button>
            </>
          )
        }
      >
        {target && (
          <div className="grid gap-4 text-[0.86rem]">
            <p className="text-ink-soft">{target.reason}</p>
            {target.method === 'ORIGINAL' ? (
              <p>The refund is sent to the customer’s original payment method. Razorpay usually settles it in 5 to 7 working days.</p>
            ) : (
              <>
                <div className="rounded-lg bg-canvas p-4">
                  <p className="text-[0.76rem] font-semibold uppercase tracking-[0.06em] text-muted">Pay to</p>
                  <p className="mt-1 select-all whitespace-pre-line">{target.payoutDetails ?? 'No details recorded. Ask the customer.'}</p>
                </div>
                <Input label="Bank or UPI transaction reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UTR 4329 8812 3301" />
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
