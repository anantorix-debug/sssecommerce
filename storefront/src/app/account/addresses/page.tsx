'use client';

import { MapPin, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/providers';
import { Button } from '@/components/ui/Button';
import { Checkbox, FormError, Input, Select } from '@/components/ui/Field';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/Sheet';
import { ApiError, call, errorMessage } from '@/lib/client';
import { STATES } from '@/lib/india';
import type { Address } from '@/lib/types';

type Draft = Omit<Address, 'id' | 'floor'> & { id?: string; floor: string };
const blank: Draft = { name: '', phone: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '', floor: '', hasLift: true, isDefault: false };

export default function AddressesPage() {
  const { notify } = useToast();
  const [list, setList] = useState<Address[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => call<Address[]>('/me/addresses').then(setList).catch(() => setList([]));
  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    setErrors({});
    const { id, ...body } = draft;
    const json = { ...body, line2: body.line2 || null, landmark: body.landmark || null, floor: body.floor ? Number(body.floor) : null };
    try {
      await call(id ? `/me/addresses/${id}` : '/me/addresses', { method: id ? 'PATCH' : 'POST', json });
      setDraft(null);
      notify('Address saved');
      void load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_FAILED') setErrors(err.fieldErrors());
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a: Address) => {
    await call(`/me/addresses/${a.id}`, { method: 'DELETE' }).catch(() => undefined);
    notify('Address removed');
    void load();
  };

  const set = (k: keyof Draft, v: string | boolean) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display-lg">Addresses</h1>
        <Button onClick={() => setDraft({ ...blank })}>Add an address</Button>
      </div>
      {!list && <Skeleton className="h-40" />}
      {list?.length === 0 && <EmptyState icon={<MapPin className="h-6 w-6" strokeWidth={1.4} />} title="No saved addresses" body="Save an address here, or at checkout, to order faster next time." />}
      {list && list.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map((a) => (
            <div key={a.id} className="grid gap-3 rounded-xl border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{a.name}</p>
                {a.isDefault && <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[0.72rem] font-semibold text-accent-strong">Default</span>}
              </div>
              <p className="text-[0.9rem] leading-relaxed text-ink-soft">
                {a.line1}
                {a.line2 ? `, ${a.line2}` : ''}
                <br />
                {a.city}, {a.state} {a.pincode}
                <br />
                {a.phone}
                {a.floor !== null && <> · Floor {a.floor}{a.hasLift ? ', lift available' : ', no lift'}</>}
              </p>
              <div className="flex gap-4 text-[0.85rem]">
                <button onClick={() => setDraft({ ...a, line2: a.line2 ?? '', landmark: a.landmark ?? '', floor: a.floor?.toString() ?? '' })} className="flex items-center gap-1.5 text-ink-soft hover:text-ink">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button onClick={() => remove(a)} className="flex items-center gap-1.5 text-ink-soft hover:text-danger">
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
                {!a.isDefault && (
                  <button
                    onClick={async () => {
                      await call(`/me/addresses/${a.id}`, { method: 'PATCH', json: { isDefault: true } });
                      void load();
                    }}
                    className="text-ink-soft hover:text-ink"
                  >
                    Make default
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={draft !== null} onClose={() => setDraft(null)} title={draft?.id ? 'Edit address' : 'New address'} width="min(520px, 100vw)" footer={<Button className="w-full" loading={busy} onClick={save}>Save address</Button>}>
        {draft && (
          <div className="grid gap-4 px-5 py-6 sm:grid-cols-2">
            <FormError message={error} />
            <Input label="Full name" value={draft.name} onChange={(e) => set('name', e.target.value)} error={errors.name} className="sm:col-span-2" />
            <Input label="Mobile number" type="tel" value={draft.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} />
            <Input label="Pincode" inputMode="numeric" maxLength={6} value={draft.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))} error={errors.pincode} />
            <Input label="House number, building and street" value={draft.line1} onChange={(e) => set('line1', e.target.value)} error={errors.line1} className="sm:col-span-2" />
            <Input label="Area or locality" optional value={draft.line2 ?? ''} onChange={(e) => set('line2', e.target.value)} />
            <Input label="Landmark" optional value={draft.landmark ?? ''} onChange={(e) => set('landmark', e.target.value)} />
            <Input label="City" value={draft.city} onChange={(e) => set('city', e.target.value)} error={errors.city} />
            <Select label="State" value={draft.state} onChange={(e) => set('state', e.target.value)} error={errors.state} options={[{ value: '', label: 'Choose…' }, ...STATES.map((s) => ({ value: s, label: s }))]} />
            <Input label="Floor" optional inputMode="numeric" value={draft.floor} onChange={(e) => set('floor', e.target.value.replace(/\D/g, ''))} />
            <div className="flex items-end pb-3">
              <Checkbox label="Lift fits furniture" checked={draft.hasLift} onChange={(e) => set('hasLift', e.target.checked)} />
            </div>
            <Checkbox label="Use as my default address" checked={draft.isDefault} onChange={(e) => set('isDefault', e.target.checked)} className="sm:col-span-2" />
          </div>
        )}
      </Sheet>
    </div>
  );
}
