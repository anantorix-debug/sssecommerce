'use client';

import clsx from 'clsx';
import { ArrowLeft, Check } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FormError } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/misc';
import { call, errorMessage } from '@/lib/client';
import { dateTime, inr, longDate } from '@/lib/format';

interface ReturnDetail {
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
  photoCount: number;
  createdAt: string;
  events: { status: string; at: string; note: string | null }[];
  order: { orderNumber: string; paymentMethod: string };
  items: { orderItemId: string; productName: string; variantTitle: string; image: string | null; quantity: number; unitPrice: number }[];
  refunds: { id: string; amount: number; status: string; method: string }[];
}

const STEPS = [
  { key: 'REQUESTED', label: 'Requested' },
  { key: 'PICKUP_SCHEDULED', label: 'Pickup scheduled' },
  { key: 'RECEIVED', label: 'Received' },
  { key: 'INSPECTED', label: 'Inspected' },
  { key: 'REFUNDED', label: 'Refunded' },
];

export default function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [r, setR] = useState<ReturnDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    call<ReturnDetail>(`/me/returns/${id}`).then(setR).catch((e) => setError(errorMessage(e)));
  }, [id]);
  if (error) return <FormError message={error} />;
  if (!r) return <Skeleton className="h-96" />;

  const reached = new Set(r.events.map((e) => (e.status === 'APPROVED' ? 'PICKUP_SCHEDULED' : e.status)));
  return (
    <div className="grid max-w-3xl gap-8">
      <Link href="/account/returns" className="flex items-center gap-2 text-[0.88rem] text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> All returns
      </Link>
      <header className="grid gap-2">
        <h1 className="display-lg">{r.returnNumber}</h1>
        <p className="text-ink-soft">
          For order <Link href={`/account/orders/${r.order.orderNumber}`} className="underline">{r.order.orderNumber}</Link> · requested {longDate(r.createdAt)}
        </p>
      </header>

      {r.status === 'REJECTED' ? (
        <div className="rounded-lg border border-danger/20 bg-danger/[0.04] p-5">
          <p className="font-medium text-danger">Not approved</p>
          <p className="mt-1 text-ink-soft">{r.rejectReason}</p>
        </div>
      ) : (
        <ol className="grid grid-cols-5 gap-2">
          {STEPS.map((s) => {
            const done = reached.has(s.key) || (s.key === 'REFUNDED' && r.status === 'CLOSED');
            return (
              <li key={s.key} className="grid gap-2">
                <span className={clsx('h-1 rounded-full', done ? 'bg-accent' : 'bg-line')} />
                <span className={clsx('flex items-center gap-1 text-[0.75rem] font-medium', done ? 'text-ink' : 'text-muted')}>
                  {done && <Check className="h-3 w-3 text-accent" strokeWidth={2.4} />}
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {r.pickupDate && r.status === 'PICKUP_SCHEDULED' && <p className="rounded-lg bg-accent-soft px-4 py-3 text-accent-strong">Pickup on {longDate(r.pickupDate)}. Please keep the item ready, in its packaging if you still have it.</p>}
      {r.inspectionPass === false && <p className="rounded-lg bg-danger/[0.05] px-4 py-3 text-danger">The item did not pass inspection. {r.inspectionNotes}</p>}
      {r.refunds.map((f) => (
        <p key={f.id} className="rounded-lg bg-success/[0.07] px-4 py-3 text-success">
          Refund of {inr(f.amount)}: {f.status.toLowerCase()}.
        </p>
      ))}

      <ul className="divide-y divide-line border-y border-line">
        {r.items.map((i) => (
          <li key={i.orderItemId} className="flex items-center gap-4 py-4">
            <div className="relative h-20 w-16 shrink-0 overflow-hidden bg-paper-2">{i.image && <Image src={i.image} alt="" fill sizes="64px" className="object-cover" />}</div>
            <div className="flex-1 text-[0.9rem]">
              <p className="font-medium">{i.productName}</p>
              <p className="text-muted">
                {i.variantTitle} · Qty {i.quantity}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <dl className="grid gap-3 text-[0.9rem] sm:grid-cols-2">
        <div>
          <dt className="text-muted">Reason</dt>
          <dd>{r.reason}</dd>
        </div>
        <div>
          <dt className="text-muted">You asked for</dt>
          <dd>{r.resolution === 'REFUND' ? 'A refund' : 'A replacement'}</dd>
        </div>
        {r.details && (
          <div className="sm:col-span-2">
            <dt className="text-muted">Details</dt>
            <dd>{r.details}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted">Photos</dt>
          <dd>{r.photoCount ? `${r.photoCount} attached` : 'None'}</dd>
        </div>
      </dl>

      <div className="grid gap-3">
        <h2 className="font-medium">Updates</h2>
        <ol className="grid gap-3 border-l border-line pl-5">
          {r.events.map((e, i) => (
            <li key={i} className="relative text-[0.88rem]">
              <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-accent" />
              <span className="font-medium capitalize">{e.status.replace(/_/g, ' ').toLowerCase()}</span> <span className="text-muted">· {dateTime(e.at)}</span>
              {e.note && <p className="text-ink-soft">{e.note}</p>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
