import clsx from 'clsx';
import { Check, Download } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { dateTime, inr, longDate } from '@/lib/format';
import type { OrderDetail, OrderStatus } from '@/lib/types';

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'PROCESSING', label: 'Being prepared' },
  { key: 'SHIPPED', label: 'Out for delivery' },
  { key: 'DELIVERED', label: 'Delivered' },
];
const RANK: Record<OrderStatus, number> = { PENDING_PAYMENT: 0, PENDING_CONFIRMATION: 0, CONFIRMED: 1, PROCESSING: 2, SHIPPED: 3, DELIVERED: 4, CANCELLED: -1, EXPIRED: -1 };

export function StatusBadge({ status, label }: { status: OrderStatus | string; label: string }) {
  const tone =
    status === 'DELIVERED' ? 'bg-success/10 text-success'
    : status === 'CANCELLED' || status === 'EXPIRED' ? 'bg-danger/10 text-danger'
    : status === 'PENDING_PAYMENT' || status === 'PENDING_CONFIRMATION' ? 'bg-warning/10 text-warning'
    : 'bg-accent-soft text-accent-strong';
  return <span className={clsx('inline-flex rounded-full px-3 py-1 text-[0.75rem] font-semibold', tone)}>{label}</span>;
}

/** Progress across the four delivery stages, with the full event history underneath. */
export function OrderProgress({ order }: { order: OrderDetail }) {
  const rank = RANK[order.status];
  if (rank < 0) {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger/[0.04] p-5 text-[0.92rem]">
        <p className="font-medium text-danger">{order.statusLabel}</p>
        {order.cancelReason && <p className="mt-1 text-ink-soft">Reason: {order.cancelReason}</p>}
        {order.refunds.length > 0 && <p className="mt-1 text-ink-soft">Refund of {inr(order.refunds[0].amount)}: {order.refunds[0].status.toLowerCase()}.</p>}
      </div>
    );
  }
  return (
    <div className="grid gap-6">
      <ol className="grid grid-cols-4 gap-2" aria-label="Order progress">
        {STEPS.map((s, i) => {
          const done = rank >= i + 1;
          const event = order.timeline.find((t) => t.status === s.key);
          return (
            <li key={s.key} className="grid gap-2">
              <span className={clsx('h-1 rounded-full', done ? 'bg-accent' : 'bg-line')} />
              <span className="flex items-center gap-1.5 text-[0.8rem] font-medium">
                {done && <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2.4} />}
                <span className={done ? 'text-ink' : 'text-muted'}>{s.label}</span>
              </span>
              {event && <span className="text-[0.72rem] text-muted">{dateTime(event.at)}</span>}
            </li>
          );
        })}
      </ol>
      {order.status === 'PENDING_CONFIRMATION' && (
        <p className="rounded-lg bg-warning/[0.07] px-4 py-3 text-[0.88rem] text-warning">
          We’ll call {order.phone} within one working day to confirm this cash-on-delivery order.
        </p>
      )}
      {order.deliverySlot && (
        <p className="text-[0.9rem] text-ink-soft">
          Delivery booked for <span className="font-medium text-ink">{longDate(order.deliverySlot.date)}, {order.deliverySlot.window}</span>
          {order.installation ? ' · installation on the same visit' : ''}
        </p>
      )}
      {order.trackingNote && <p className="text-[0.9rem] text-ink-soft">{order.trackingNote}</p>}
    </div>
  );
}

export function OrderItems({ order, actions }: { order: OrderDetail; actions?: (item: OrderDetail['items'][number]) => React.ReactNode }) {
  return (
    <ul className="divide-y divide-line">
      {order.items.map((i) => (
        <li key={i.id} className="flex gap-4 py-4">
          <Link href={`/products/${i.productSlug}`} className="relative h-24 w-20 shrink-0 overflow-hidden bg-paper-2">
            {i.image && <Image src={i.image} alt="" fill sizes="80px" className="object-cover" />}
          </Link>
          <div className="grid min-w-0 flex-1 content-start gap-1 text-[0.9rem]">
            <Link href={`/products/${i.productSlug}`} className="font-medium hover:text-accent">
              {i.productName}
            </Link>
            <p className="text-muted">
              {i.variantTitle} · Qty {i.quantity}
            </p>
            {i.installationIncluded && <p className="text-[0.82rem] text-ink-soft">Installation included</p>}
            {actions && <div className="mt-1 flex flex-wrap gap-3">{actions(i)}</div>}
          </div>
          <p className="tabular">{inr(i.lineTotal)}</p>
        </li>
      ))}
    </ul>
  );
}

export function OrderTotals({ order }: { order: OrderDetail }) {
  const t = order.totals;
  return (
    <dl className="grid gap-2 text-[0.9rem]">
      <div className="flex justify-between"><dt className="text-ink-soft">Subtotal</dt><dd className="tabular">{inr(t.subtotal)}</dd></div>
      {t.discount > 0 && <div className="flex justify-between text-accent"><dt>Coupon {t.couponCode}</dt><dd className="tabular">−{inr(t.discount)}</dd></div>}
      <div className="flex justify-between"><dt className="text-ink-soft">Delivery</dt><dd className="tabular">{t.delivery ? inr(t.delivery) : 'Free'}</dd></div>
      <div className="flex justify-between border-t border-line pt-3 font-medium"><dt>Total</dt><dd className="tabular">{inr(t.total)}</dd></div>
      <p className="text-[0.78rem] text-muted">Includes {inr(t.taxIncluded)} GST · {order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Paid online'}</p>
    </dl>
  );
}

export function OrderAddress({ order }: { order: OrderDetail }) {
  const a = order.shippingAddress;
  return (
    <address className="not-italic text-[0.9rem] leading-relaxed text-ink-soft">
      <span className="font-medium text-ink">{a.name}</span>
      <br />
      {a.line1}
      {a.line2 ? `, ${a.line2}` : ''}
      {a.landmark ? `, near ${a.landmark}` : ''}
      <br />
      {a.city}, {a.state} {a.pincode}
      <br />
      {a.phone}
    </address>
  );
}

export function InvoiceLink({ order, token }: { order: OrderDetail; token?: string }) {
  if (!order.invoice) return null;
  return (
    <a href={`/api/store/orders/${order.orderNumber}/invoice${token ? `?t=${token}` : ''}`} className="inline-flex items-center gap-2 text-[0.88rem] font-medium text-accent hover:underline">
      <Download className="h-4 w-4" /> GST invoice {order.invoice.number}
    </a>
  );
}
