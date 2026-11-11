'use client';

import clsx from 'clsx';
import { ArrowLeft, Check, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/providers';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/misc';
import { call, errorMessage } from '@/lib/client';
import { dayDate } from '@/lib/format';

interface Slots {
  earliest: string;
  installationIncluded: boolean;
  current: string | null;
  slots: { id: string; date: string; window: string; available: number; full: boolean }[];
}

export default function SchedulePage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const router = useRouter();
  const { notify } = useToast();
  const [data, setData] = useState<Slots | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    call<Slots>(`/me/orders/${orderNumber}/slots`)
      .then((d) => {
        setData(d);
        setPicked(d.current);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [orderNumber]);

  const days = useMemo(() => {
    const map = new Map<string, Slots['slots']>();
    for (const s of data?.slots ?? []) map.set(s.date, [...(map.get(s.date) ?? []), s]);
    return [...map.entries()];
  }, [data]);

  const save = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await call(`/me/orders/${orderNumber}/schedule`, { method: 'POST', json: { slotId: picked } });
      notify('Delivery slot booked. We’ll call before we arrive.');
      router.push(`/account/orders/${orderNumber}`);
    } catch (err) {
      setError(errorMessage(err));
      // a full slot means someone just took it: refresh availability
      call<Slots>(`/me/orders/${orderNumber}/slots`).then(setData).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-8">
      <Link href={`/account/orders/${orderNumber}`} className="flex items-center gap-2 text-[0.88rem] text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to order {orderNumber}
      </Link>
      <header className="grid gap-3">
        <h1 className="display-lg">Choose your delivery slot</h1>
        <p className="max-w-xl text-ink-soft">Pick a day and a window that suits you. Our team will call 30 minutes before arriving.</p>
        {data?.installationIncluded && (
          <p className="flex items-center gap-2 text-[0.9rem] text-accent-strong">
            <Wrench className="h-4 w-4" /> Installation happens on the same visit.
          </p>
        )}
      </header>
      <FormError message={error} />
      {!data && !error && <Skeleton className="h-80" />}
      {data && days.length === 0 && <p className="text-ink-soft">No slots are open right now. Please check again tomorrow, or contact us and we’ll arrange a time.</p>}
      {data && days.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {days.map(([date, slots]) => (
            <div key={date} className="grid gap-2 rounded-xl border border-line bg-surface p-4">
              <p className="font-medium">{dayDate(date)}</p>
              <div className="grid gap-2">
                {slots.map((s) => (
                  <button
                    key={s.id}
                    disabled={s.full}
                    onClick={() => setPicked(s.id)}
                    aria-pressed={picked === s.id}
                    className={clsx(
                      'flex items-center justify-between rounded-lg border px-4 py-3 text-[0.9rem] transition-colors',
                      picked === s.id ? 'border-ink bg-ink text-paper' : 'border-line-strong hover:border-ink',
                      s.full && 'cursor-not-allowed opacity-40 line-through',
                    )}
                  >
                    <span className="tabular">{s.window}</span>
                    <span className="text-[0.78rem] opacity-80">{s.full ? 'Full' : picked === s.id ? <Check className="h-4 w-4" /> : s.available <= 2 ? `${s.available} left` : ''}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="sticky bottom-4 flex justify-end">
        <Button size="lg" onClick={save} loading={busy} disabled={!picked || picked === data?.current}>
          Confirm slot
        </Button>
      </div>
    </div>
  );
}
