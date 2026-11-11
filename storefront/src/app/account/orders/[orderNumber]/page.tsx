'use client';

import { ArrowLeft, CalendarDays, RotateCcw, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { InvoiceLink, OrderAddress, OrderItems, OrderProgress, OrderTotals, StatusBadge } from '@/components/order/OrderParts';
import { useToast } from '@/components/providers';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FormError, Select, Textarea } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/Sheet';
import { call, errorMessage } from '@/lib/client';
import { dateTime, inr, longDate } from '@/lib/format';
import type { OrderDetail } from '@/lib/types';

const REASONS = ['Ordered by mistake', 'Found a better option', 'Delivery date doesn’t suit me', 'Want to change the finish or size', 'Other'];

export default function OrderPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const { notify } = useToast();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(() => call<OrderDetail>(`/me/orders/${orderNumber}`).then(setOrder).catch((e) => setError(errorMessage(e))), [orderNumber]);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <FormError message={error} />;
  if (!order) return <Skeleton className="h-[560px]" />;

  const cancel = async () => {
    setBusy(true);
    setCancelError(null);
    try {
      const updated = await call<OrderDetail>(`/me/orders/${orderNumber}/cancel`, { method: 'POST', json: { reason: reason === 'Other' ? details || 'Other' : reason } });
      setOrder(updated);
      setCancelOpen(false);
      notify(updated.paymentMethod === 'ONLINE' && updated.refunds.length ? 'Order cancelled. Your refund has been started.' : 'Order cancelled.');
    } catch (err) {
      setCancelError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-10">
      <Link href="/account/orders" className="flex items-center gap-2 text-[0.88rem] text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> All orders
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-2">
          <h1 className="display-lg">{order.orderNumber}</h1>
          <p className="text-ink-soft">Placed {longDate(order.placedAt)} · {inr(order.totals.total)}</p>
        </div>
        <StatusBadge status={order.status} label={order.statusLabel} />
      </header>

      <OrderProgress order={order} />

      <div className="flex flex-wrap gap-3">
        {order.actions.canSchedule && (
          <ButtonLink href={`/account/orders/${order.orderNumber}/schedule`}>
            <CalendarDays className="h-4 w-4" /> {order.deliverySlot ? 'Change delivery slot' : 'Choose a delivery slot'}
          </ButtonLink>
        )}
        {order.actions.canPay && <ButtonLink href={`/checkout/confirmation/${order.orderNumber}`}>Complete payment</ButtonLink>}
        {order.actions.canReturn && order.items.some((i) => i.returnableQuantity > 0) && (
          <ButtonLink href={`/account/orders/${order.orderNumber}/return`} variant="secondary">
            <RotateCcw className="h-4 w-4" /> Request a return
          </ButtonLink>
        )}
        {order.actions.canCancel && (
          <Button variant="ghost" onClick={() => setCancelOpen(true)} className="text-danger hover:bg-danger/[0.06]">
            Cancel order
          </Button>
        )}
      </div>

      <div className="grid gap-10 lg:grid-cols-12">
        <section className="lg:col-span-7">
          <h2 className="display-sm mb-2">Items</h2>
          <OrderItems
            order={order}
            actions={(i) => (
              <>
                {i.canReview && (
                  <Link href={`/account/reviews/new?item=${i.id}`} className="flex items-center gap-1.5 text-[0.85rem] font-medium text-accent hover:underline">
                    <Star className="h-3.5 w-3.5" /> Write a review
                  </Link>
                )}
                {i.review && <span className="text-[0.82rem] text-muted">Review {i.review.status === 'APPROVED' ? 'published' : 'awaiting moderation'}</span>}
              </>
            )}
          />
          {order.returns.length > 0 && (
            <div className="mt-8 grid gap-2">
              <h3 className="font-medium">Returns</h3>
              {order.returns.map((r) => (
                <Link key={r.id} href={`/account/returns/${r.id}`} className="flex justify-between rounded-md border border-line px-4 py-3 text-[0.88rem] hover:border-ink">
                  <span>{r.returnNumber}</span>
                  <span className="text-muted">{r.status.replace(/_/g, ' ').toLowerCase()}</span>
                </Link>
              ))}
            </div>
          )}
          <div className="mt-8 grid gap-3">
            <h3 className="font-medium">History</h3>
            <ol className="grid gap-3 border-l border-line pl-5">
              {order.timeline.map((t, i) => (
                <li key={i} className="relative text-[0.88rem]">
                  <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-accent" />
                  <span className="font-medium">{t.label}</span> <span className="text-muted">· {dateTime(t.at)}</span>
                  {t.note && <p className="text-ink-soft">{t.note}</p>}
                </li>
              ))}
            </ol>
          </div>
        </section>
        <aside className="grid content-start gap-6 rounded-xl border border-line bg-surface p-6 lg:col-span-5">
          <OrderTotals order={order} />
          <div className="grid gap-2 border-t border-line pt-5">
            <p className="text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-muted">Delivery address</p>
            <OrderAddress order={order} />
          </div>
          <InvoiceLink order={order} />
          {order.refunds.length > 0 && (
            <div className="grid gap-1 border-t border-line pt-5 text-[0.88rem]">
              <p className="font-medium">Refunds</p>
              {order.refunds.map((r, i) => (
                <p key={i} className="text-ink-soft">
                  {inr(r.amount)} · {r.status.toLowerCase()} · {r.method === 'ORIGINAL' ? 'to original payment' : r.method === 'UPI' ? 'UPI' : 'bank transfer'}
                </p>
              ))}
            </div>
          )}
          <Link href="/contact" className="text-[0.85rem] text-ink-soft hover:text-ink">
            Need help with this order? Contact us
          </Link>
        </aside>
      </div>

      <Sheet
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this order?"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button variant="danger" className="flex-1" loading={busy} onClick={cancel}>
              Cancel order
            </Button>
          </div>
        }
      >
        <div className="grid gap-5 px-5 py-6">
          <p className="text-ink-soft">
            {order.paymentMethod === 'ONLINE' && order.payment?.status === 'CAPTURED'
              ? `You’ll get a full refund of ${inr(order.totals.total)} to your original payment method, usually within 5 to 7 working days.`
              : 'Nothing will be charged.'}
          </p>
          <FormError message={cancelError} />
          <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} options={REASONS.map((r) => ({ value: r, label: r }))} />
          {reason === 'Other' && <Textarea label="Tell us more" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={280} />}
        </div>
      </Sheet>
    </div>
  );
}
