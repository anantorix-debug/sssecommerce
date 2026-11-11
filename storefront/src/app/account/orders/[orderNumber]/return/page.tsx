'use client';

import { ArrowLeft, Minus, Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/providers';
import { Button } from '@/components/ui/Button';
import { FormError, Select, Textarea } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/misc';
import { PhotoUpload, type Uploaded } from '@/components/ui/PhotoUpload';
import { call, errorMessage } from '@/lib/client';
import type { OrderDetail } from '@/lib/types';

const REASONS = ['Damaged in delivery', 'Defective or not working', 'Different from what I ordered', 'Does not fit my space', 'Changed my mind', 'Other'];

export default function ReturnRequestPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const router = useRouter();
  const { notify } = useToast();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState('');
  const [photos, setPhotos] = useState<Uploaded[]>([]);
  const [resolution, setResolution] = useState<'REFUND' | 'REPLACEMENT'>('REFUND');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    call<OrderDetail>(`/me/orders/${orderNumber}`).then(setOrder).catch((e) => setError(errorMessage(e)));
  }, [orderNumber]);

  const returnable = order?.items.filter((i) => i.returnableQuantity > 0) ?? [];
  const damaged = reason === 'Damaged in delivery' || reason === 'Defective or not working';

  const submit = async () => {
    setError(null);
    const items = Object.entries(qty).filter(([, q]) => q > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    if (!items.length) return setError('Choose at least one item to return.');
    if (damaged && photos.length === 0) return setError('Please add a photo of the damage so we can help quickly.');
    setBusy(true);
    try {
      const r = await call<{ id: string }>(`/me/orders/${orderNumber}/returns`, { method: 'POST', json: { items, reason, details: details || undefined, photos: photos.map((p) => p.key), resolution } });
      notify('Return requested. We’ll review it within one working day.');
      router.push(`/account/returns/${r.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!order) return error ? <FormError message={error} /> : <Skeleton className="h-96" />;

  return (
    <div className="grid max-w-3xl gap-8">
      <Link href={`/account/orders/${orderNumber}`} className="flex items-center gap-2 text-[0.88rem] text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to order {orderNumber}
      </Link>
      <header className="grid gap-3">
        <h1 className="display-lg">Request a return</h1>
        <p className="text-ink-soft">Choose what you’d like to return. We’ll confirm within one working day and collect it from your home.</p>
      </header>
      <FormError message={error} />
      {returnable.length === 0 ? (
        <p className="text-ink-soft">No items in this order can be returned now. The return window may have closed, or the items are not returnable.</p>
      ) : (
        <>
          <ul className="divide-y divide-line border-y border-line">
            {returnable.map((i) => (
              <li key={i.id} className="flex items-center gap-4 py-4">
                <div className="relative h-20 w-16 shrink-0 overflow-hidden bg-paper-2">{i.image && <Image src={i.image} alt="" fill sizes="64px" className="object-cover" />}</div>
                <div className="min-w-0 flex-1 text-[0.9rem]">
                  <p className="font-medium">{i.productName}</p>
                  <p className="text-muted">{i.variantTitle} · return within {i.returnWindowDays} days of delivery</p>
                </div>
                <div className="flex items-center rounded-full border border-line-strong">
                  <button type="button" className="grid h-9 w-9 place-items-center disabled:opacity-30" disabled={!qty[i.id]} onClick={() => setQty({ ...qty, [i.id]: (qty[i.id] ?? 0) - 1 })} aria-label={`Return one fewer ${i.productName}`}>
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center tabular">{qty[i.id] ?? 0}</span>
                  <button type="button" className="grid h-9 w-9 place-items-center disabled:opacity-30" disabled={(qty[i.id] ?? 0) >= i.returnableQuantity} onClick={() => setQty({ ...qty, [i.id]: (qty[i.id] ?? 0) + 1 })} aria-label={`Return one more ${i.productName}`}>
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} options={REASONS.map((r) => ({ value: r, label: r }))} />
          <Textarea label="Tell us more" optional value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} placeholder="What happened? This helps us fix it." />
          <div className="grid gap-2">
            <p className="text-[0.82rem] font-medium text-ink-soft">Photos {damaged ? '(required for damage)' : '(optional)'}</p>
            <PhotoUpload purpose="return" value={photos} onChange={setPhotos} />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-[0.82rem] font-medium text-ink-soft">What would you like?</legend>
            {(['REFUND', 'REPLACEMENT'] as const).map((r) => (
              <label key={r} className="flex items-center gap-3 text-[0.92rem]">
                <input type="radio" name="resolution" checked={resolution === r} onChange={() => setResolution(r)} className="h-4 w-4 accent-[var(--color-accent)]" />
                {r === 'REFUND' ? 'A refund' : 'A replacement of the same item'}
              </label>
            ))}
          </fieldset>
          <Button size="lg" onClick={submit} loading={busy} className="justify-self-start">
            Request return
          </Button>
          <p className="text-[0.82rem] text-muted">
            Refunds go back to your original payment method. For cash-on-delivery orders we’ll ask for your bank or UPI details. Read the <Link href="/policies/returns" className="underline">returns policy</Link>.
          </p>
        </>
      )}
    </div>
  );
}
