'use client';

import { Check, MapPin, Phone } from 'lucide-react';
import { useState } from 'react';
import { call, errorMessage } from '@/lib/client';
import { deliveryBy, inr, listJoin } from '@/lib/format';
import type { Delivery } from '@/lib/types';
import { useSaved, useSettings } from '../providers';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { Sheet } from '../ui/Sheet';

export function PincodeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pincode, setPincode } = useSaved();
  const settings = useSettings();
  const [value, setValue] = useState(pincode ?? '');
  const [result, setResult] = useState<Delivery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const check = async () => {
    setError(null);
    if (!/^[1-9]\d{5}$/.test(value)) {
      setError('Enter a valid 6-digit pincode.');
      return;
    }
    setLoading(true);
    try {
      const d = await call<Delivery>(`/store/pincodes/${value}`);
      setResult(d);
      if (d.serviceable) setPincode(value);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Where should we deliver?" width="min(420px, 100vw)">
      <div className="grid gap-5 px-5 py-6">
        <p className="text-ink-soft">We’ll show delivery dates and cash-on-delivery availability for your area on every product.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void check();
          }}
          className="flex items-end gap-3"
        >
          <Input
            label="Pincode"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            value={value}
            onChange={(e) => {
              setValue(e.target.value.replace(/\D/g, ''));
              setResult(null);
            }}
            error={error ?? undefined}
            className="flex-1"
          />
          <Button type="submit" loading={loading} className="mb-[1px] h-12">
            Check
          </Button>
        </form>
        {result && result.serviceable && (
          <div className="grid gap-2 rounded-lg border border-accent/25 bg-accent-soft p-4 text-[0.92rem]">
            <p className="flex items-center gap-2 font-medium text-accent-strong">
              <Check className="h-4 w-4" /> We deliver to {[result.area, result.city].filter((x, i, a) => x && a.indexOf(x) === i).join(', ') || result.pincode}
              {result.state && <span className="font-normal text-ink-soft">, {result.state}</span>}
            </p>
            {result.estimate && (
              <p className="text-ink-soft">
                In-stock furniture: <span className="font-semibold text-ink">delivery by {deliveryBy(result.estimate.to)}</span>
                {result.deliveryFee ? <> · {inr(result.deliveryFee)} delivery (free above {inr(settings.freeDeliveryAbove)})</> : <> · free delivery</>}
              </p>
            )}
            <p className="text-ink-soft">{result.codAvailable ? 'Cash on delivery available.' : settings.payments.cod ? 'Pay online for this pincode.' : 'Pay securely online by UPI, card or net banking.'}</p>
            <Button variant="primary" onClick={onClose} className="mt-2 justify-self-start">
              Continue shopping
            </Button>
          </div>
        )}
        {result && !result.serviceable && result.reason === 'INVALID' && (
          <p className="rounded-lg border border-danger/25 bg-danger/[0.04] p-4 text-[0.92rem] font-medium text-danger">Not a valid pincode. Please check and try again.</p>
        )}
        {result && !result.serviceable && result.reason !== 'INVALID' && (
          <div className="grid gap-3 rounded-lg border border-line bg-paper-2 p-4 text-[0.92rem]">
            <p className="flex gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {settings.deliversAllIndia ? (
                  <>We can’t deliver to {result.pincode} online right now.</>
                ) : (
                  <>
                    We don’t deliver to {result.pincode} online yet.
                    {settings.deliveryCities.length > 0 && <> We currently deliver in {listJoin(settings.deliveryCities)}.</>}
                  </>
                )}
              </span>
            </p>
            <a href={`tel:${settings.store.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-3 rounded-md bg-surface px-3 py-2.5 font-medium text-ink hover:text-accent">
              <Phone className="h-4 w-4 shrink-0 text-accent" />
              <span>
                Call {settings.store.phone} <span className="block text-[0.8rem] font-normal text-muted">We may still be able to deliver to you. Ask us.</span>
              </span>
            </a>
          </div>
        )}
      </div>
    </Sheet>
  );
}
