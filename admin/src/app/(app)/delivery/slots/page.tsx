'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, ErrorBox, Input, Loading, Modal, PageHeader, Toggle, useToast } from '@/components/ui';
import { api, message, useApi } from '@/lib/api';

interface Slot {
  id: string;
  date: string;
  window: string;
  capacity: number;
  booked: number;
  active: boolean;
  location: { name: string };
  locationId: string;
  orders: { id: string; orderNumber: string; name: string; status: string }[];
}

export default function SlotsPage() {
  const toast = useToast();
  const [locationId, setLocationId] = useState('');
  const { data: locations } = useApi<{ id: string; name: string }[]>('/locations');
  const { data, error, reload } = useApi<Slot[]>(`/delivery/slots?days=14${locationId ? `&locationId=${locationId}` : ''}`);
  const [edit, setEdit] = useState<Slot | null>(null);
  const [capacity, setCapacity] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const days = new Map<string, Slot[]>();
  for (const s of data ?? []) days.set(s.date, [...(days.get(s.date) ?? []), s]);

  return (
    <>
      <PageHeader
        title="Delivery slots"
        description="Customers book these after their order is confirmed. Set how many deliveries each team can handle per window."
        actions={
          <>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-[0.86rem]" aria-label="Location">
              <option value="">All locations</option>
              {locations?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <Button
              onClick={async () => {
                const r = await api<{ created: number }>('/delivery/slots/generate', { method: 'POST', json: { days: 21 } }).catch((e) => (toast(message(e), 'error'), null));
                if (r) toast(r.created ? `${r.created} new slots opened` : 'Slots for the next 3 weeks are already open');
                void reload();
              }}
            >
              Open next 3 weeks
            </Button>
          </>
        }
      />
      <ErrorBox message={error} />
      {!data ? (
        <Loading />
      ) : days.size === 0 ? (
        <Card>
          <p className="text-muted">No slots in the next two weeks. Use “Open next 3 weeks”.</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...days.entries()].map(([d, slots]) => (
            <Card key={d} title={new Date(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })} padded={false}>
              <ul className="divide-y divide-line">
                {slots.map((s) => {
                  const pct = s.capacity ? Math.min(100, (s.booked / s.capacity) * 100) : 100;
                  return (
                    <li key={s.id} className={clsx('grid gap-2 px-5 py-3', !s.active && 'opacity-50')}>
                      <div className="flex items-center justify-between gap-2 text-[0.84rem]">
                        <span>
                          <span className="font-medium tabular">{s.window}</span> <span className="text-muted">· {s.location.name}</span>
                        </span>
                        <button
                          className="text-[0.78rem] text-accent hover:underline"
                          onClick={() => {
                            setEdit(s);
                            setCapacity(String(s.capacity));
                            setActive(s.active);
                          }}
                        >
                          {s.booked}/{s.capacity} · edit
                        </button>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                        <div className={clsx('h-full rounded-full', pct >= 100 ? 'bg-clay' : 'bg-accent')} style={{ width: `${pct}%` }} />
                      </div>
                      {s.orders.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {s.orders.map((o) => (
                            <Link key={o.id} href={`/orders/${o.id}`} className="text-[0.76rem] text-ink-soft hover:text-accent">
                              {o.orderNumber}
                            </Link>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
      <Modal
        open={edit !== null}
        onClose={() => setEdit(null)}
        title={edit ? `${new Date(edit.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${edit.window}` : ''}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Back</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                if (!edit) return;
                setBusy(true);
                try {
                  await api(`/delivery/slots/${edit.id}`, { method: 'PATCH', json: { capacity: Number(capacity), active } });
                  toast('Slot updated');
                  setEdit(null);
                  void reload();
                } catch (err) {
                  toast(message(err), 'error');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Input label="Capacity (deliveries)" type="number" min={edit?.booked ?? 0} value={capacity} onChange={(e) => setCapacity(e.target.value)} hint={edit ? `${edit.booked} already booked` : undefined} />
          <Toggle checked={active} onChange={setActive} label="Open for booking" hint="Turn off for holidays or when a team is unavailable. Existing bookings stay." />
        </div>
      </Modal>
    </>
  );
}
