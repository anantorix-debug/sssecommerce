'use client';

import clsx from 'clsx';
import { Check, Package } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormError, Input } from '@/components/ui/Field';
import { call, errorMessage } from '@/lib/client';
import { dateTime, longDate } from '@/lib/format';

interface Tracked {
  orderNumber: string;
  status: string;
  statusLabel: string;
  placedAt: string;
  deliverySlot: { date: string; window: string } | null;
  timeline: { status: string; label: string; at: string }[];
  items: { productName: string; variantTitle: string; quantity: number; image: string | null }[];
  trackingNote: string | null;
  link: string;
}

const STEPS = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
const NAMES: Record<string, string> = { CONFIRMED: 'Confirmed', PROCESSING: 'Being prepared', SHIPPED: 'Out for delivery', DELIVERED: 'Delivered' };

export default function TrackPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [data, setData] = useState<Tracked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="container-x grid gap-12 pb-10 pt-10 lg:grid-cols-12">
      <div className="grid content-start gap-6 lg:col-span-5">
        <Package className="h-9 w-9 text-accent" strokeWidth={1.3} />
        <h1 className="display-lg">Track your order</h1>
        <p className="text-ink-soft">Enter your order number (from your confirmation email) and the email you ordered with.</p>
        <form
          className="grid gap-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setBusy(true);
            try {
              setData(await call<Tracked>('/store/track', { method: 'POST', json: { orderNumber, email } }));
            } catch (err) {
              setData(null);
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <FormError message={error} />
          <Input label="Order number" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value.toUpperCase())} placeholder="SSS-2610-001234" required />
          <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" size="lg" loading={busy} className="justify-self-start">
            Track order
          </Button>
        </form>
        <p className="text-[0.88rem] text-muted">
          Have an account?{' '}
          <Link href="/account/orders" className="underline">
            See all your orders
          </Link>
        </p>
      </div>
      {data && (
        <div className="grid content-start gap-8 rounded-xl border border-line bg-surface p-6 sm:p-8 lg:col-span-6 lg:col-start-7">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="display-sm">{data.orderNumber}</h2>
            <span className="text-[0.88rem] font-medium text-accent">{data.statusLabel}</span>
          </div>
          <ol className="grid gap-4">
            {STEPS.map((s) => {
              const ev = data.timeline.find((t) => t.status === s);
              return (
                <li key={s} className="flex items-center gap-4">
                  <span className={clsx('grid h-7 w-7 place-items-center rounded-full', ev ? 'bg-accent text-white' : 'border border-line-strong text-muted')}>{ev && <Check className="h-4 w-4" />}</span>
                  <span className={ev ? 'font-medium' : 'text-muted'}>{NAMES[s]}</span>
                  {ev && <span className="ml-auto text-[0.82rem] text-muted">{dateTime(ev.at)}</span>}
                </li>
              );
            })}
          </ol>
          {data.deliverySlot && <p className="text-ink-soft">Delivery booked for {longDate(data.deliverySlot.date)}, {data.deliverySlot.window}.</p>}
          <ul className="grid gap-3 border-t border-line pt-6">
            {data.items.map((i, idx) => (
              <li key={idx} className="flex items-center gap-4 text-[0.9rem]">
                <div className="relative h-14 w-12 shrink-0 overflow-hidden bg-paper-2">{i.image && <Image src={i.image} alt="" fill sizes="48px" className="object-cover" />}</div>
                <span className="flex-1">
                  {i.productName} <span className="text-muted">· {i.variantTitle} × {i.quantity}</span>
                </span>
              </li>
            ))}
          </ul>
          <Link href={data.link} className="font-medium text-accent hover:underline">
            Open the full order page
          </Link>
        </div>
      )}
    </div>
  );
}
