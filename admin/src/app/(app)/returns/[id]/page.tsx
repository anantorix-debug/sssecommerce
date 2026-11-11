'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, ErrorBox, Input, Loading, Modal, PageHeader, Select, StatusBadge, Textarea, Toggle, useToast } from '@/components/ui';
import { api, date, dateTime, inr, message, useApi } from '@/lib/api';

interface Ret {
  id: string;
  returnNumber: string;
  status: string;
  statusLabel: string;
  reason: string;
  details: string | null;
  resolution: string;
  pickupDate: string | null;
  inspectionPass: boolean | null;
  inspectionNotes: string | null;
  rejectReason: string | null;
  refundAmount: number | null;
  photos: string[];
  createdAt: string;
  events: { status: string; at: string; note: string | null }[];
  order: { orderNumber: string; paymentMethod: string; email: string; name: string; phone: string; shippingAddress: Record<string, string> };
  items: { orderItemId: string; productName: string; variantTitle: string; image: string | null; quantity: number; unitPrice: number }[];
  refunds: { id: string; amount: number; status: string; method: string; reference: string | null }[];
}

type To = 'PICKUP_SCHEDULED' | 'REJECTED' | 'RECEIVED' | 'INSPECTED' | 'REFUNDED' | 'CLOSED';

export default function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data: r, error, setData } = useApi<Ret>(`/returns/${id}`);
  const [to, setTo] = useState<To | null>(null);
  const [form, setForm] = useState({ note: '', pickupDate: '', inspectionPass: true, restock: true, refundMethod: 'BANK_TRANSFER', payoutDetails: '', rejectReason: '' });
  const [busy, setBusy] = useState(false);

  if (error) return <ErrorBox message={error} />;
  if (!r) return <Loading rows={10} />;

  const activeRefund = r.refunds.some((f) => f.status !== 'FAILED' && f.status !== 'REJECTED');
  const value = r.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const next: { to: To; label: string; variant?: 'primary' | 'danger' | 'secondary' }[] =
    r.status === 'REQUESTED' || r.status === 'APPROVED'
      ? [{ to: 'PICKUP_SCHEDULED', label: 'Approve and schedule pickup', variant: 'primary' }, { to: 'REJECTED', label: 'Reject', variant: 'danger' }]
      : r.status === 'PICKUP_SCHEDULED'
        ? [{ to: 'RECEIVED', label: 'Mark received at warehouse', variant: 'primary' }]
        : r.status === 'RECEIVED'
          ? [{ to: 'INSPECTED', label: 'Record inspection', variant: 'primary' }]
          : r.status === 'INSPECTED'
            ? [...(r.inspectionPass && !activeRefund ? [{ to: 'REFUNDED' as To, label: 'Refund customer', variant: 'primary' as const }] : []), { to: 'CLOSED', label: 'Close return' }]
            : r.status === 'REFUNDED'
              ? [{ to: 'CLOSED', label: 'Close return' }]
              : [];

  const submit = async () => {
    if (!to) return;
    setBusy(true);
    try {
      const updated = await api<Ret>(`/returns/${r.id}/advance`, {
        method: 'POST',
        json: {
          to,
          note: form.note || undefined,
          pickupDate: to === 'PICKUP_SCHEDULED' ? form.pickupDate : undefined,
          inspectionPass: to === 'INSPECTED' ? form.inspectionPass : undefined,
          restock: to === 'INSPECTED' ? form.inspectionPass && form.restock : undefined,
          refundMethod: to === 'REFUNDED' && r.order.paymentMethod === 'COD' ? form.refundMethod : undefined,
          payoutDetails: to === 'REFUNDED' && r.order.paymentMethod === 'COD' ? form.payoutDetails : undefined,
          rejectReason: to === 'REJECTED' ? form.rejectReason : undefined,
        },
      });
      setData(updated);
      toast('Return updated. The customer has been emailed.');
      setTo(null);
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        back={{ href: '/returns', label: 'Returns' }}
        title={<span className="flex flex-wrap items-center gap-3">{r.returnNumber} <StatusBadge status={r.status} label={r.statusLabel} /></span>}
        description={`Order ${r.order.orderNumber} · requested ${dateTime(r.createdAt)} · customer wants ${r.resolution === 'REFUND' ? 'a refund' : 'a replacement'}`}
        actions={next.map((n) => (
          <Button key={n.to} variant={n.variant ?? 'secondary'} onClick={() => setTo(n.to)}>
            {n.label}
          </Button>
        ))}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="grid content-start gap-6 xl:col-span-2">
          <Card title="Items" padded={false}>
            <ul className="divide-y divide-line">
              {r.items.map((i) => (
                <li key={i.orderItemId} className="flex items-center gap-4 px-5 py-4">
                  <div className="h-16 w-14 overflow-hidden rounded-md bg-canvas">{i.image && <img src={i.image} alt="" className="h-full w-full object-cover" />}</div>
                  <div className="flex-1">
                    <p className="font-medium">{i.productName}</p>
                    <p className="text-[0.78rem] text-muted">{i.variantTitle}</p>
                  </div>
                  <p className="tabular">{i.quantity} × {inr(i.unitPrice)}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Customer’s reason">
            <p className="font-medium">{r.reason}</p>
            {r.details && <p className="mt-2 text-[0.88rem] text-ink-soft">{r.details}</p>}
            {r.photos.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-3">
                {r.photos.map((k) => (
                  <a key={k} href={`/api/admin/files/${k}`} target="_blank" rel="noreferrer" className="h-28 w-28 overflow-hidden rounded-lg border border-line">
                    <img src={`/api/admin/files/${k}`} alt="Customer photo" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            )}
          </Card>
          <Card title="History">
            <ol className="grid gap-3">
              {r.events.map((e, i) => (
                <li key={i} className="relative border-l border-line pl-5 text-[0.86rem]">
                  <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
                  <span className="font-medium">{e.status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span> <span className="text-muted">· {dateTime(e.at)}</span>
                  {e.note && <p className="text-ink-soft">{e.note}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="grid content-start gap-6">
          <Card title="Customer">
            <div className="grid gap-0.5 text-[0.86rem]">
              <p className="font-medium">{r.order.name}</p>
              <p>{r.order.phone}</p>
              <p className="text-ink-soft">{r.order.email}</p>
              <p className="mt-2 text-ink-soft">{r.order.shippingAddress.line1}, {r.order.shippingAddress.city} {r.order.shippingAddress.pincode}</p>
            </div>
          </Card>
          <Card title="Summary">
            <dl className="grid gap-2 text-[0.86rem]">
              <div className="flex justify-between"><dt className="text-muted">Item value</dt><dd className="tabular">{inr(value)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Paid by</dt><dd><Badge tone={r.order.paymentMethod === 'COD' ? 'warning' : 'info'}>{r.order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Online'}</Badge></dd></div>
              {r.pickupDate && <div className="flex justify-between"><dt className="text-muted">Pickup</dt><dd>{date(r.pickupDate)}</dd></div>}
              {r.inspectionPass !== null && <div className="flex justify-between"><dt className="text-muted">Inspection</dt><dd>{r.inspectionPass ? 'Passed' : 'Failed'}</dd></div>}
              {r.rejectReason && <p className="text-danger">Rejected: {r.rejectReason}</p>}
            </dl>
            {r.refunds.map((f) => (
              <div key={f.id} className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[0.84rem]">
                <span>Refund {inr(f.amount)} · {f.method === 'ORIGINAL' ? 'Razorpay' : f.method.replace('_', ' ').toLowerCase()}</span>
                <StatusBadge status={f.status} />
              </div>
            ))}
            {r.refunds.some((f) => f.status === 'REQUESTED') && <p className="mt-2 text-[0.78rem] text-muted">Pay the customer, then mark the refund processed under Refunds.</p>}
          </Card>
        </div>
      </div>

      <Modal
        open={to !== null}
        onClose={() => setTo(null)}
        title={next.find((n) => n.to === to)?.label ?? ''}
        footer={
          <>
            <Button onClick={() => setTo(null)}>Back</Button>
            <Button
              variant={to === 'REJECTED' ? 'danger' : 'primary'}
              loading={busy}
              onClick={submit}
              disabled={(to === 'PICKUP_SCHEDULED' && !form.pickupDate) || (to === 'REJECTED' && form.rejectReason.trim().length < 5) || (to === 'REFUNDED' && r.order.paymentMethod === 'COD' && form.payoutDetails.trim().length < 5)}
            >
              Confirm
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {to === 'PICKUP_SCHEDULED' && <Input label="Pickup date" type="date" min={new Date().toISOString().slice(0, 10)} value={form.pickupDate} onChange={(e) => setForm({ ...form, pickupDate: e.target.value })} />}
          {to === 'REJECTED' && <Textarea label="Reason (the customer will see this)" value={form.rejectReason} onChange={(e) => setForm({ ...form, rejectReason: e.target.value })} placeholder="e.g. The return window for this item closed on 12 October." />}
          {to === 'INSPECTED' && (
            <>
              <Toggle checked={form.inspectionPass} onChange={(v) => setForm({ ...form, inspectionPass: v })} label="Item passed inspection" hint="Unused, undamaged by the customer, all parts present." />
              {form.inspectionPass && <Toggle checked={form.restock} onChange={(v) => setForm({ ...form, restock: v })} label="Put back into sellable stock" />}
            </>
          )}
          {to === 'REFUNDED' && (
            <>
              <p className="text-[0.86rem] text-ink-soft">
                Refund amount: <span className="font-semibold">{inr(value)}</span> (what the customer paid for these items).
                {r.order.paymentMethod === 'ONLINE' ? ' It goes back to their original payment method through Razorpay.' : ' This was cash on delivery, so pay it out by bank transfer or UPI, then mark it processed under Refunds.'}
              </p>
              {r.order.paymentMethod === 'COD' && (
                <>
                  <Select label="Pay by" value={form.refundMethod} onChange={(e) => setForm({ ...form, refundMethod: e.target.value })} options={[{ value: 'BANK_TRANSFER', label: 'Bank transfer' }, { value: 'UPI', label: 'UPI' }]} />
                  <Textarea label="Customer’s bank or UPI details" value={form.payoutDetails} onChange={(e) => setForm({ ...form, payoutDetails: e.target.value })} placeholder="Account name, number and IFSC, or UPI ID" />
                </>
              )}
            </>
          )}
          <Textarea label="Note (optional, shown in the history)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
      </Modal>
    </>
  );
}
