'use client';

import { CalendarDays, CheckCircle2, Clock, Mail } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { InvoiceLink, OrderAddress, OrderItems, OrderProgress, OrderTotals, StatusBadge } from '@/components/order/OrderParts';
import { useCart, useSession, useSettings, useToast } from '@/components/providers';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { call, errorMessage } from '@/lib/client';
import { inr } from '@/lib/format';
import { openRazorpay } from '@/lib/razorpay';
import type { OrderDetail, PaymentStart } from '@/lib/types';

export function Confirmation({ orderNumber }: { orderNumber: string }) {
  const token = useSearchParams().get('t') ?? undefined;
  const { user } = useSession();
  const { refresh } = useCart();
  const settings = useSettings();
  const { notify } = useToast();
  const [order, setOrder] = useState<(OrderDetail & { payment: PaymentStart }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const o = await call<OrderDetail & { payment: PaymentStart }>(`/store/checkout/orders/${orderNumber}${token ? `?t=${token}` : ''}`);
      setOrder(o);
      return o;
    } catch (err) {
      setError(errorMessage(err));
      return null;
    }
  }, [orderNumber, token]);

  useEffect(() => {
    void load();
    void refresh();
  }, [load, refresh]);

  // While an online payment is pending, check every few seconds (the webhook may confirm it).
  useEffect(() => {
    if (order?.status !== 'PENDING_PAYMENT') return;
    const poll = setInterval(load, 4000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const stop = setTimeout(() => clearInterval(poll), 120_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      clearTimeout(stop);
    };
  }, [order?.status, load]);

  const pay = async () => {
    if (!order) return;
    setPaying(true);
    try {
      const start = await call<PaymentStart>(`/store/checkout/orders/${orderNumber}/pay`, { method: 'POST', json: { token } });
      if (!start.razorpay) {
        await load();
        return;
      }
      await openRazorpay(start, settings.store.name, {
        onSuccess: async (r) => {
          await call('/store/checkout/payments/verify', { method: 'POST', json: { orderNumber, token, razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature } }).catch(() => undefined);
          await load();
          void refresh();
        },
        onDismiss: () => setPaying(false),
        onFailure: (m) => notify(`Payment failed: ${m}`, { tone: 'error' }),
      });
    } catch (err) {
      notify(errorMessage(err), { tone: 'error' });
    } finally {
      setPaying(false);
    }
  };

  if (error) {
    return (
      <div className="container-x">
        <EmptyState title="We couldn’t find this order" body="Check the link in your confirmation email, or track your order with its number and your email address." action={<ButtonLink href="/track">Track an order</ButtonLink>} />
      </div>
    );
  }
  if (!order) {
    return (
      <div className="container-x grid gap-6 py-14">
        <Skeleton className="h-24 w-2/3" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const pending = order.status === 'PENDING_PAYMENT';
  const expired = order.status === 'EXPIRED';
  const left = order.reservationExpiresAt ? Math.max(0, new Date(order.reservationExpiresAt).getTime() - now) : 0;
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);

  return (
    <div className="container-x py-12 lg:py-16">
      <div className="mx-auto grid max-w-5xl gap-10">
        <header className="grid gap-4">
          {pending ? (
            <Clock className="h-10 w-10 text-warning" strokeWidth={1.4} />
          ) : expired ? null : (
            <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={1.4} />
          )}
          <h1 className="display-lg">
            {pending ? 'Complete your payment' : expired ? 'This order wasn’t paid in time' : order.status === 'PENDING_CONFIRMATION' ? `Thank you, ${order.name.split(' ')[0]}. We’ve got your order.` : `Thank you, ${order.name.split(' ')[0]}. Your order is confirmed.`}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-[0.92rem] text-ink-soft">
            <span>
              Order <span className="font-medium text-ink">{order.orderNumber}</span>
            </span>
            <StatusBadge status={order.status} label={order.statusLabel} />
          </div>
        </header>

        {pending && (
          <div className="grid gap-4 rounded-xl border border-warning/30 bg-warning/[0.06] p-6">
            <p>
              We’re holding your items for <span className="font-semibold tabular">{mm}:{String(ss).padStart(2, '0')}</span>. If your payment went through, this page will update on its own in a few seconds.
            </p>
            <Button onClick={pay} loading={paying} className="justify-self-start">
              Pay {inr(order.totals.total)} now
            </Button>
          </div>
        )}
        {expired && (
          <div className="grid gap-4 rounded-xl border border-line bg-surface p-6">
            <p className="text-ink-soft">The payment wasn’t completed within 15 minutes, so the items were released. You haven’t been charged. If money left your account, it will be refunded automatically.</p>
            <ButtonLink href="/cart" className="justify-self-start">
              Return to your cart
            </ButtonLink>
          </div>
        )}

        {!pending && !expired && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Next
              icon={<Mail className="h-5 w-5" />}
              title="Confirmation sent"
              body={order.invoice ? `We’ve emailed ${order.email} with your order details. Your GST invoice is ready below.` : `We’ve emailed ${order.email} with your order details. Your GST invoice follows once the order is confirmed.`}
            />
            <Next
              icon={<CalendarDays className="h-5 w-5" />}
              title="Choose your delivery slot"
              body={order.status === 'PENDING_CONFIRMATION' ? 'Once we confirm your order by phone, you can pick a slot.' : user ? 'Pick a morning or afternoon slot that suits you.' : 'We’ll email you a link to choose a slot.'}
              action={user && order.actions.canSchedule ? <Link href={`/account/orders/${order.orderNumber}/schedule`} className="font-medium text-accent hover:underline">Choose a slot</Link> : undefined}
            />
            <Next icon={<CheckCircle2 className="h-5 w-5" />} title="Delivered and installed" body="Our team brings it in, assembles it and takes the packaging away." />
          </div>
        )}

        <div className="grid gap-10 lg:grid-cols-12">
          <div className="grid content-start gap-8 lg:col-span-7">
            <OrderProgress order={order} />
            <OrderItems order={order} />
          </div>
          <aside className="grid content-start gap-6 rounded-xl border border-line bg-surface p-6 lg:col-span-5">
            <OrderTotals order={order} />
            <div className="grid gap-2 border-t border-line pt-5">
              <p className="text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-muted">Delivering to</p>
              <OrderAddress order={order} />
            </div>
            <InvoiceLink order={order} token={token} />
            {user ? (
              <ButtonLink href={`/account/orders/${order.orderNumber}`} variant="secondary">
                View in your account
              </ButtonLink>
            ) : (
              <div className="grid gap-3 rounded-lg bg-paper-2 p-4 text-[0.88rem]">
                <p>Create an account with {order.email} to track this order, book your delivery slot and reorder easily.</p>
                <ButtonLink href={`/register?email=${encodeURIComponent(order.email)}`} size="sm" className="justify-self-start">
                  Create an account
                </ButtonLink>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Next({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="grid content-start gap-2 rounded-xl border border-line bg-surface p-5">
      <span className="text-accent">{icon}</span>
      <p className="font-medium">{title}</p>
      <p className="text-[0.86rem] text-ink-soft">{body}</p>
      {action && <div className="text-[0.88rem]">{action}</div>}
    </div>
  );
}
