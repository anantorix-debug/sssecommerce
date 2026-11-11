'use client';

import { ExternalLink, FileDown, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useCan } from '@/components/staff';
import { Badge, Button, Card, ErrorBox, Input, Loading, Modal, MoneyInput, PageHeader, Select, StatusBadge, Textarea, useToast } from '@/components/ui';
import { api, date, dateTime, inr, message, useApi } from '@/lib/api';

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  statusLabel: string;
  version: number;
  paymentMethod: 'ONLINE' | 'COD';
  name: string;
  email: string;
  phone: string;
  placedAt: string;
  shippingAddress: Record<string, string | number | boolean | null>;
  gstin: string | null;
  customerNote: string | null;
  trackingNote: string | null;
  cancelReason: string | null;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  grandTotal: number;
  couponCode: string | null;
  internalNotes: { text: string; by: string; at: string }[];
  items: { id: string; productName: string; productSlug: string; variantTitle: string; sku: string; image: string | null; unitPrice: number; quantity: number; discount: number; lineTotal: number; gstRate: number; installationIncluded: boolean }[];
  events: { id: string; label: string; note: string | null; actorName: string; createdAt: string }[];
  payments: { id: string; method: string; status: string; amount: number; providerPaymentId: string | null; providerOrderId: string | null; errorReason: string | null; collectedAt: string | null; collectedBy: string | null; createdAt: string }[];
  refunds: { id: string; amount: number; status: string; method: string; reason: string; reference: string | null; createdAt: string }[];
  invoice: { id: string; number: string; issuedAt: string } | null;
  deliverySlot: { date: string; window: string } | null;
  installations: { id: string; scheduledOn: string; window: string; status: string; technician: string | null }[];
  returns: { id: string; returnNumber: string; status: string }[];
  user: { id: string; email: string; name: string | null } | null;
  storefrontUrl: string;
  allowed: { confirm_cod: boolean; start_processing: boolean; ship: boolean; deliver: boolean; cancel: boolean };
}

type Action = 'confirm_cod' | 'start_processing' | 'ship' | 'deliver' | 'cancel';
const ACTION_LABEL: Record<Action, string> = {
  confirm_cod: 'Confirm COD order',
  start_processing: 'Start preparing',
  ship: 'Mark dispatched',
  deliver: 'Mark delivered',
  cancel: 'Cancel order',
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const toast = useToast();
  const { data: o, error, reload, setData } = useApi<Order>(`/orders/${id}`);
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState('');
  const [tracking, setTracking] = useState('');
  const [busy, setBusy] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [refundOpen, setRefundOpen] = useState(false);
  const [refund, setRefund] = useState<{ amount: number | null; reason: string; method: 'ORIGINAL' | 'BANK_TRANSFER' | 'UPI'; payoutDetails: string }>({ amount: null, reason: '', method: 'ORIGINAL', payoutDetails: '' });

  if (error) return <ErrorBox message={error} />;
  if (!o) return <Loading rows={12} />;

  const run = async () => {
    if (!action) return;
    setBusy(true);
    try {
      const updated = await api<Order>(`/orders/${o.id}/transition`, { method: 'POST', json: { action, note: note || undefined, trackingNote: tracking || undefined, version: o.version } });
      setData(updated);
      toast(`${ACTION_LABEL[action]}: done. The customer has been emailed.`);
      setAction(null);
      setNote('');
      setTracking('');
    } catch (err) {
      toast(message(err), 'error');
      void reload();
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    await api(`/orders/${o.id}/notes`, { method: 'POST', json: { text: noteText } }).catch((e) => toast(message(e), 'error'));
    setNoteText('');
    void reload();
  };

  const paid = o.payments.find((p) => ['CAPTURED', 'COLLECTED', 'PARTIALLY_REFUNDED'].includes(p.status));
  const refunded = o.refunds.filter((r) => r.status !== 'FAILED' && r.status !== 'REJECTED').reduce((s, r) => s + r.amount, 0);
  const a = o.shippingAddress;
  const available = (Object.keys(o.allowed) as Action[]).filter((k) => o.allowed[k]);

  return (
    <>
      <PageHeader
        back={{ href: '/orders', label: 'Orders' }}
        title={<span className="flex flex-wrap items-center gap-3">{o.orderNumber} <StatusBadge status={o.status} label={o.statusLabel} /></span>}
        description={`Placed ${dateTime(o.placedAt)} · ${o.paymentMethod === 'COD' ? 'Cash on delivery' : 'Online payment'}`}
        actions={
          <>
            {o.invoice && (
              <a href={`/api/admin/orders/${o.id}/invoice`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-[0.86rem] font-medium hover:border-ink">
                <FileDown className="h-4 w-4" /> Invoice {o.invoice.number}
              </a>
            )}
            <a href={o.storefrontUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[0.86rem] text-muted hover:text-ink">
              <ExternalLink className="h-4 w-4" /> Customer view
            </a>
          </>
        }
      />

      {available.length > 0 && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-[0.86rem] text-ink-soft">
            {o.status === 'PENDING_CONFIRMATION' && `Call ${o.name} on ${o.phone} to confirm this cash-on-delivery order before preparing it.`}
            {o.status === 'CONFIRMED' && (o.deliverySlot ? `Delivery booked for ${date(o.deliverySlot.date)}, ${o.deliverySlot.window}.` : 'The customer has not booked a delivery slot yet.')}
            {o.status === 'PROCESSING' && 'Packed and ready? Mark it dispatched when it leaves the warehouse.'}
            {o.status === 'SHIPPED' && 'Out for delivery. Mark it delivered once the customer has received it.'}
            {o.status === 'PENDING_PAYMENT' && 'Waiting for the customer’s online payment. Unpaid orders expire after 15 minutes.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {available.filter((k) => k !== 'cancel').map((k) => (
              <Button key={k} variant="primary" onClick={() => setAction(k)} disabled={!can('orders.write')}>
                {ACTION_LABEL[k]}
              </Button>
            ))}
            {o.allowed.cancel && can('orders.cancel') && (
              <Button variant="danger" onClick={() => setAction('cancel')}>
                Cancel order
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="grid content-start gap-6 xl:col-span-2">
          <Card title={`Items (${o.items.length})`} padded={false}>
            <ul className="divide-y divide-line">
              {o.items.map((i) => (
                <li key={i.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="h-16 w-14 shrink-0 overflow-hidden rounded-md bg-canvas">{i.image && <img src={i.image} alt="" className="h-full w-full object-cover" />}</div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.productName}</p>
                    <p className="text-[0.78rem] text-muted">
                      {i.variantTitle} · SKU {i.sku} · GST {i.gstRate}%
                    </p>
                    {i.installationIncluded && <Badge tone="accent">Installation</Badge>}
                  </div>
                  <div className="text-right text-[0.86rem]">
                    <p className="tabular">{i.quantity} × {inr(i.unitPrice)}</p>
                    {i.discount > 0 && <p className="text-[0.76rem] text-accent tabular">−{inr(i.discount)}</p>}
                    <p className="font-semibold tabular">{inr(i.lineTotal - i.discount)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <dl className="grid gap-1.5 border-t border-line px-5 py-4 text-[0.86rem]">
              <Row label="Subtotal" value={inr(o.subtotal)} />
              {o.discountTotal > 0 && <Row label={`Coupon ${o.couponCode ?? ''}`} value={`−${inr(o.discountTotal)}`} />}
              <Row label="Delivery" value={o.shippingTotal ? inr(o.shippingTotal) : 'Free'} />
              <Row label="GST included" value={inr(o.taxTotal)} muted />
              <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Total</dt><dd className="tabular">{inr(o.grandTotal)}</dd></div>
            </dl>
          </Card>

          <Card title="Timeline" padded={false}>
            <ol className="grid gap-0 px-5 py-4">
              {o.events.map((e) => (
                <li key={e.id} className="relative border-l border-line pb-4 pl-5 last:pb-0">
                  <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
                  <p className="text-[0.86rem]">
                    <span className="font-medium">{e.label}</span> <span className="text-muted">· {dateTime(e.createdAt)} · {e.actorName}</span>
                  </p>
                  {e.note && <p className="text-[0.8rem] text-ink-soft">{e.note}</p>}
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Internal notes">
            <div className="grid gap-3">
              {o.internalNotes.length === 0 && <p className="text-[0.84rem] text-muted">Only staff can see these notes.</p>}
              {o.internalNotes.map((n, i) => (
                <div key={i} className="rounded-lg bg-canvas px-4 py-3 text-[0.86rem]">
                  <p>{n.text}</p>
                  <p className="mt-1 text-[0.74rem] text-muted">{n.by} · {dateTime(n.at)}</p>
                </div>
              ))}
              <div className="flex gap-2">
                <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note (e.g. called customer, prefers mornings)" className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong px-3 text-[0.86rem]" onKeyDown={(e) => e.key === 'Enter' && addNote()} aria-label="New note" />
                <Button onClick={addNote}>Add</Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card title="Customer">
            <div className="grid gap-1 text-[0.86rem]">
              <p className="font-medium">{o.name}</p>
              <p className="select-all text-ink-soft">{o.email}</p>
              <p className="select-all text-ink-soft">{o.phone}</p>
              {o.user ? <Link href={`/customers/${o.user.id}`} className="mt-1 text-accent hover:underline">View customer</Link> : <p className="mt-1 text-[0.78rem] text-muted">Guest checkout</p>}
            </div>
          </Card>
          <Card title="Delivery" actions={<button onClick={() => window.print()} className="text-muted hover:text-ink" aria-label="Print"><Printer className="h-4 w-4" /></button>}>
            <address className="grid gap-0.5 text-[0.86rem] not-italic text-ink-soft">
              <span className="font-medium text-ink">{String(a.name)}</span>
              <span>{String(a.line1)}{a.line2 ? `, ${a.line2}` : ''}</span>
              {a.landmark && <span>Near {String(a.landmark)}</span>}
              <span>{String(a.city)}, {String(a.state)} {String(a.pincode)}</span>
              <span>{String(a.phone)}</span>
              {a.floor !== null && a.floor !== undefined && <span>Floor {String(a.floor)} · {a.hasLift ? 'lift available' : 'no lift'}</span>}
            </address>
            {o.deliverySlot && <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-[0.84rem] text-accent">Slot: {date(o.deliverySlot.date)}, {o.deliverySlot.window}</p>}
            {o.installations.map((j) => (
              <p key={j.id} className="mt-2 text-[0.8rem] text-muted">Installation {j.status.toLowerCase()} · {date(j.scheduledOn)} {j.window}{j.technician ? ` · ${j.technician}` : ''}</p>
            ))}
            {o.customerNote && <p className="mt-3 rounded-lg bg-warning/[0.07] px-3 py-2 text-[0.82rem] text-warning">Customer note: {o.customerNote}</p>}
            {o.trackingNote && <p className="mt-2 text-[0.82rem] text-ink-soft">Dispatch note: {o.trackingNote}</p>}
            {o.gstin && <p className="mt-2 text-[0.8rem] text-muted">GSTIN {o.gstin}</p>}
          </Card>
          <Card title="Payments and refunds" actions={paid && can('refunds.approve') && refunded < paid.amount ? <Button size="sm" onClick={() => { setRefund({ amount: paid.amount - refunded, reason: '', method: paid.method === 'ONLINE' ? 'ORIGINAL' : 'BANK_TRANSFER', payoutDetails: '' }); setRefundOpen(true); }}>Refund</Button> : undefined}>
            <div className="grid gap-3 text-[0.84rem]">
              {o.payments.map((p) => (
                <div key={p.id} className="grid gap-0.5">
                  <div className="flex items-center justify-between">
                    <span>{p.method === 'COD' ? 'Cash on delivery' : 'Razorpay'}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="text-[0.76rem] text-muted tabular">
                    {inr(p.amount)}
                    {p.providerPaymentId && ` · ${p.providerPaymentId}`}
                    {p.collectedBy && ` · collected by ${p.collectedBy}`}
                  </p>
                  {p.errorReason && <p className="text-[0.76rem] text-danger">{p.errorReason}</p>}
                </div>
              ))}
              {o.refunds.map((r) => (
                <div key={r.id} className="grid gap-0.5 border-t border-line pt-3">
                  <div className="flex items-center justify-between">
                    <span>Refund {inr(r.amount)}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-[0.76rem] text-muted">{r.reason}{r.reference ? ` · ref ${r.reference}` : ''}</p>
                </div>
              ))}
            </div>
          </Card>
          {o.returns.length > 0 && (
            <Card title="Returns">
              {o.returns.map((r) => (
                <Link key={r.id} href={`/returns/${r.id}`} className="flex justify-between py-1 text-[0.86rem] hover:text-accent">
                  {r.returnNumber} <StatusBadge status={r.status} />
                </Link>
              ))}
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={action !== null}
        onClose={() => setAction(null)}
        title={action ? ACTION_LABEL[action] : ''}
        footer={
          <>
            <Button onClick={() => setAction(null)}>Back</Button>
            <Button variant={action === 'cancel' ? 'danger' : 'primary'} loading={busy} onClick={run} disabled={action === 'cancel' && note.trim().length < 3}>
              {action ? ACTION_LABEL[action] : ''}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {action === 'confirm_cod' && <p className="text-[0.86rem] text-ink-soft">Confirm only after speaking to the customer. A GST invoice is issued and the customer is emailed to choose a delivery slot.</p>}
          {action === 'ship' && (
            <>
              <p className="text-[0.86rem] text-ink-soft">The customer is emailed that their order is on its way{o.deliverySlot ? `, due ${date(o.deliverySlot.date)}, ${o.deliverySlot.window}` : ''}.</p>
              <Input label="Message for the customer (optional)" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="e.g. Our team (Ravi, 98xxxxxx12) will call 30 minutes before arriving." />
            </>
          )}
          {action === 'deliver' && <p className="text-[0.86rem] text-ink-soft">The customer is emailed and invited to review. {o.paymentMethod === 'COD' && 'Remember to record the cash collected under COD collections.'}</p>}
          {action === 'cancel' && (
            <p className="text-[0.86rem] text-ink-soft">
              Stock is put back and any held slot is freed.{' '}
              {o.payments.some((p) => p.status === 'CAPTURED') ? `A full refund of ${inr(o.grandTotal)} is started to the original payment method.` : 'Nothing has been paid, so no refund is needed.'}
            </p>
          )}
          <Textarea label={action === 'cancel' ? 'Reason (the customer will see this)' : 'Note for the timeline (optional)'} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </div>
      </Modal>

      <Modal
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        title="Refund this order"
        footer={
          <>
            <Button onClick={() => setRefundOpen(false)}>Back</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!refund.amount || refund.reason.trim().length < 3}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/orders/${o.id}/refunds`, { method: 'POST', json: { amount: refund.amount, reason: refund.reason, method: refund.method, payoutDetails: refund.payoutDetails || undefined } });
                  toast(refund.method === 'ORIGINAL' ? 'Refund sent to Razorpay.' : 'Refund recorded. Pay it out, then mark it processed under Refunds.');
                  setRefundOpen(false);
                  void reload();
                } catch (err) {
                  toast(message(err), 'error');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Refund {refund.amount ? inr(refund.amount) : ''}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <p className="text-[0.84rem] text-muted">Paid {paid ? inr(paid.amount) : '—'} · already refunded {inr(refunded)}. Refunds can’t exceed what was paid.</p>
          <MoneyInput label="Amount (₹)" value={refund.amount} onChange={(v) => setRefund({ ...refund, amount: v })} />
          <Select
            label="Refund to"
            value={refund.method}
            onChange={(e) => setRefund({ ...refund, method: e.target.value as typeof refund.method })}
            options={paid?.method === 'ONLINE' ? [{ value: 'ORIGINAL', label: 'Original payment method (Razorpay)' }, { value: 'BANK_TRANSFER', label: 'Bank transfer' }, { value: 'UPI', label: 'UPI' }] : [{ value: 'BANK_TRANSFER', label: 'Bank transfer' }, { value: 'UPI', label: 'UPI' }]}
          />
          {refund.method !== 'ORIGINAL' && <Textarea label="Customer’s bank or UPI details" value={refund.payoutDetails} onChange={(e) => setRefund({ ...refund, payoutDetails: e.target.value })} placeholder="Account name, number and IFSC, or UPI ID" />}
          <Input label="Reason" value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} placeholder="e.g. Goodwill for delayed delivery" />
        </div>
      </Modal>
    </>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? 'text-muted' : ''}`}>
      <dt>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
