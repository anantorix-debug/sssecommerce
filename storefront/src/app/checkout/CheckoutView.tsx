'use client';

import clsx from 'clsx';
import { Banknote, CreditCard, Info, Lock, Phone, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { useCart, useSaved, useSession, useSettings, useToast } from '@/components/providers';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Checkbox, FormError, Input, Select, Textarea } from '@/components/ui/Field';
import { Img } from '@/components/ui/Img';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { ApiError, call, errorMessage, idempotencyKey } from '@/lib/client';
import { arrivalRange, inr, listJoin } from '@/lib/format';
import { STATES } from '@/lib/india';
import { openRazorpay } from '@/lib/razorpay';
import type { Address, Delivery, PaymentStart } from '@/lib/types';

interface Form {
  email: string;
  phone: string;
  name: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  floor: string;
  hasLift: boolean;
  gstin: string;
  note: string;
  saveAddress: boolean;
  acceptTerms: boolean;
}

const empty: Form = { email: '', phone: '', name: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '', floor: '', hasLift: true, gstin: '', note: '', saveAddress: true, acceptTerms: false };

export function CheckoutView() {
  const router = useRouter();
  const settings = useSettings();
  const { notify } = useToast();
  const { user, ready } = useSession();
  const { cart, refresh } = useCart();
  const { setPincode } = useSaved();
  const [form, setForm] = useState<Form>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<string | 'new'>('new');
  const [method, setMethod] = useState<'ONLINE' | 'COD'>('ONLINE');
  const [placing, setPlacing] = useState(false);
  const [lookup, setLookup] = useState<Delivery | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  // Prefill for signed-in customers
  useEffect(() => {
    if (!ready || !user) return;
    setForm((f) => ({ ...f, email: f.email || user.email, name: f.name || user.name || '', phone: f.phone || user.phone || '' }));
    call<Address[]>('/me/addresses')
      .then((list) => {
        setAddresses(list);
        const def = list.find((a) => a.isDefault) ?? list[0];
        if (def) pickAddress(def);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  const pickAddress = (a: Address) => {
    setAddressId(a.id);
    setForm((f) => ({ ...f, name: f.name || a.name, phone: f.phone || a.phone, line1: a.line1, line2: a.line2 ?? '', landmark: a.landmark ?? '', city: a.city, state: a.state, pincode: a.pincode, floor: a.floor?.toString() ?? '', hasLift: a.hasLift, saveAddress: false }));
    setPincode(a.pincode);
  };

  // Pincode drives city/state autofill, delivery fee and cash-on-delivery availability.
  useEffect(() => {
    if (!/^[1-9]\d{5}$/.test(form.pincode)) {
      setLookup(null);
      return;
    }
    const t = setTimeout(async () => {
      const d = await call<Delivery>(`/store/pincodes/${form.pincode}`).catch(() => null);
      setLookup(d);
      if (d?.serviceable) {
        setForm((f) => ({ ...f, city: f.city || d.city || '', state: STATES.includes(d.state ?? '') ? d.state! : f.state }));
        if (cart?.pincode !== form.pincode) setPincode(form.pincode);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.pincode]);

  useEffect(() => {
    if (!cart) return;
    if (!cart.payment.online.available && cart.payment.cod.available) setMethod('COD');
    if (method === 'COD' && (!cart.payment.cod.offered || !cart.payment.cod.available) && cart.payment.online.available) setMethod('ONLINE');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart?.payment.online.available, cart?.payment.cod.available]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email address.';
    if (!/^(\+91)?[6-9]\d{9}$/.test(form.phone.replace(/[\s-]/g, ''))) e.phone = 'Enter a valid 10-digit mobile number.';
    if (form.name.trim().length < 2) e.name = 'Enter your full name.';
    if (form.line1.trim().length < 3) e.line1 = 'Enter your house number and street.';
    if (!/^[1-9]\d{5}$/.test(form.pincode)) e.pincode = 'Enter a valid 6-digit pincode.';
    else if (lookup && !lookup.serviceable) e.pincode = `We don’t deliver to ${form.pincode} yet.`;
    if (form.city.trim().length < 2) e.city = 'Enter your city.';
    if (!form.state) e.state = 'Choose your state.';
    if (form.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(form.gstin.toUpperCase())) e.gstin = 'Enter a valid 15-character GSTIN, or leave it empty.';
    if (!form.acceptTerms) e.acceptTerms = 'Please accept the terms to place your order.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const goToConfirmation = (r: PaymentStart) => router.push(`/checkout/confirmation/${r.orderNumber}?t=${r.accessToken}`);

  const place = async () => {
    setFormError(null);
    if (!cart || !validate()) {
      setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 30);
      return;
    }
    setPlacing(true);
    // One key per attempt: a double click or a retry after a network error returns the same order.
    let key: string | null = null;
    try {
      key = sessionStorage.getItem('checkoutKey');
    } catch {}
    if (!key) {
      key = idempotencyKey();
      try {
        sessionStorage.setItem('checkoutKey', key);
      } catch {}
    }
    try {
      const res = await call<PaymentStart>('/store/checkout/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        json: {
          contact: { email: form.email.trim(), phone: form.phone.replace(/[\s-]/g, ''), name: form.name.trim() },
          address: {
            name: form.name.trim(),
            phone: form.phone.replace(/[\s-]/g, ''),
            line1: form.line1.trim(),
            line2: form.line2.trim() || null,
            landmark: form.landmark.trim() || null,
            city: form.city.trim(),
            state: form.state,
            pincode: form.pincode,
            floor: form.floor ? Number(form.floor) : null,
            hasLift: form.hasLift,
          },
          paymentMethod: method,
          expectedTotal: cart.summary.total,
          gstin: form.gstin.trim() || null,
          note: form.note.trim() || null,
          saveAddress: Boolean(user && addressId === 'new' && form.saveAddress),
          acceptTerms: true,
        },
      });
      try {
        sessionStorage.removeItem('checkoutKey');
      } catch {}
      if (res.paymentMethod === 'COD' || !res.razorpay) {
        void refresh();
        goToConfirmation(res);
        return;
      }
      await openRazorpay(res, settings.store.name, {
        onSuccess: async (r) => {
          try {
            await call('/store/checkout/payments/verify', {
              method: 'POST',
              json: { orderNumber: res.orderNumber, token: res.accessToken, razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature },
            });
          } catch {
            /* the webhook will still confirm the order; the confirmation page polls */
          }
          void refresh();
          goToConfirmation(res);
        },
        onDismiss: () => goToConfirmation(res),
        onFailure: (message) => {
          void call(`/store/checkout/orders/${res.orderNumber}/payment-failed`, { method: 'POST', json: { token: res.accessToken, reason: message } }).catch(() => undefined);
          notify(`Payment failed: ${message}. You can try again.`, { tone: 'error' });
        },
      });
    } catch (err) {
      try {
        sessionStorage.removeItem('checkoutKey');
      } catch {}
      if (err instanceof ApiError) {
        if (err.code === 'VALIDATION_FAILED') {
          const fe = err.fieldErrors();
          setErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k.split('.').pop()!, v])));
        }
        if (['PRICE_CHANGED', 'STOCK_INSUFFICIENT', 'COUPON_INVALID'].includes(err.code)) await refresh();
        setFormError(err.message);
      } else setFormError(errorMessage(err));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setPlacing(false);
    }
  };

  const delivery = cart?.delivery;
  const estimate = useMemo(() => (delivery?.serviceable && delivery.estimate ? arrivalRange(delivery.estimate.from, delivery.estimate.to) : null), [delivery]);

  if (!cart) {
    return (
      <div className="container-x grid gap-8 py-12 lg:grid-cols-12">
        <Skeleton className="h-[640px] lg:col-span-7" />
        <Skeleton className="h-96 lg:col-span-5" />
      </div>
    );
  }
  if (cart.items.length === 0) {
    return (
      <div className="container-x">
        <EmptyState title="Your cart is empty" body="Add something to your cart to check out." action={<ButtonLink href="/shop">Shop all furniture</ButtonLink>} />
      </div>
    );
  }

  const s = cart.summary;
  const testMode = settings.payments.mode === 'test';

  return (
    <div className="container-x py-10 lg:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display-lg">Checkout</h1>
        <p className="flex items-center gap-2 text-[0.85rem] text-muted">
          <Lock className="h-4 w-4" /> Secure checkout
        </p>
      </div>
      {testMode && cart.payment.online.available && (
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/[0.07] px-5 py-4 text-[0.9rem] text-warning">
          <Info className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            <span className="font-semibold">Test mode: no real money.</span> Online payments use Razorpay test mode. Pay with a Razorpay test card or test UPI ID.
          </p>
        </div>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:gap-14">
        <form
          className="grid content-start gap-10 lg:col-span-7"
          onSubmit={(e) => {
            e.preventDefault();
            void place();
          }}
          noValidate
        >
          <FormError message={formError} />

          <Step n={1} title="Contact">
            {!user && (
              <div className="grid gap-4 rounded-xl border border-line bg-paper p-4 sm:grid-cols-[1fr_minmax(0,17rem)] sm:items-center sm:p-5">
                <div>
                  <p className="font-medium">Faster checkout</p>
                  <p className="mt-0.5 text-[0.86rem] text-ink-soft">
                    Sign in to use saved addresses and track this order. Or{' '}
                    <Link href="/login?next=/checkout" className="font-medium text-accent hover:underline">
                      sign in with email
                    </Link>
                    , or simply continue as a guest below.
                  </p>
                </div>
                <GoogleButton next="/checkout" divider={false} />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} error={errors.email} hint="For your order confirmation and updates." className="sm:col-span-2" />
              <Input label="Full name" autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
              <Input label="Mobile number" type="tel" inputMode="tel" autoComplete="tel-national" value={form.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} hint="Our delivery team will call this number." />
            </div>
          </Step>

          <Step n={2} title="Delivery address">
            {addresses.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {addresses.map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => pickAddress(a)}
                    aria-pressed={addressId === a.id}
                    className={clsx('grid gap-1 rounded-lg border p-4 text-left text-[0.88rem] transition-colors', addressId === a.id ? 'border-ink bg-surface ring-1 ring-ink' : 'border-line-strong hover:border-ink')}
                  >
                    <span className="font-medium">{a.name}</span>
                    <span className="text-ink-soft">
                      {a.line1}
                      {a.line2 ? `, ${a.line2}` : ''}, {a.city} {a.pincode}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setAddressId('new');
                    setForm((f) => ({ ...f, line1: '', line2: '', landmark: '', city: '', state: '', pincode: '', floor: '', saveAddress: true }));
                  }}
                  className={clsx('rounded-lg border border-dashed p-4 text-left text-[0.88rem]', addressId === 'new' ? 'border-ink' : 'border-line-strong')}
                >
                  + Use a new address
                </button>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-6">
              <Input
                label="Pincode"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={6}
                value={form.pincode}
                onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))}
                error={errors.pincode || (lookup && !lookup.serviceable ? (lookup.reason === 'INVALID' ? 'Not a valid pincode.' : `We don’t deliver to ${form.pincode} yet.`) : undefined)}
                hint={lookup?.serviceable ? (lookup.city ? `Delivering to ${lookup.area && lookup.area !== lookup.city ? `${lookup.area}, ` : ''}${lookup.city}` : 'We deliver here') : undefined}
                className="sm:col-span-2"
              />
              <Input label="City" autoComplete="address-level2" value={form.city} onChange={(e) => set('city', e.target.value)} error={errors.city} className="sm:col-span-2" />
              <Select label="State" value={form.state} onChange={(e) => set('state', e.target.value)} error={errors.state} options={[{ value: '', label: 'Choose…' }, ...STATES.map((s) => ({ value: s, label: s }))]} className="sm:col-span-2" />
              {lookup && !lookup.serviceable && lookup.reason !== 'INVALID' && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/25 bg-danger/[0.04] px-4 py-3 text-[0.88rem] sm:col-span-6">
                  <p className="text-ink-soft">
                    {settings.deliversAllIndia ? (
                      <>We can’t take online orders for this pincode right now, but we may still be able to help.</>
                    ) : (
                      <>
                        {settings.deliveryCities.length > 0 ? <>We currently deliver in {listJoin(settings.deliveryCities)}. </> : null}
                        Outside these areas we may still be able to help.
                      </>
                    )}
                  </p>
                  <a href={`tel:${settings.store.phone.replace(/[^\d+]/g, '')}`} className="flex shrink-0 items-center gap-2 font-medium text-accent hover:underline">
                    <Phone className="h-4 w-4" /> Call {settings.store.phone}
                  </a>
                </div>
              )}
              <Input label="House number, building and street" autoComplete="address-line1" value={form.line1} onChange={(e) => set('line1', e.target.value)} error={errors.line1} className="sm:col-span-6" />
              <Input label="Area or locality" optional autoComplete="address-line2" value={form.line2} onChange={(e) => set('line2', e.target.value)} className="sm:col-span-3" />
              <Input label="Landmark" optional value={form.landmark} onChange={(e) => set('landmark', e.target.value)} className="sm:col-span-3" />
              <Input label="Floor" optional inputMode="numeric" value={form.floor} onChange={(e) => set('floor', e.target.value.replace(/\D/g, ''))} hint="Helps our team plan the delivery." className="sm:col-span-2" />
              <div className="flex items-center sm:col-span-4 sm:pt-6">
                <Checkbox label="The building has a lift that fits furniture" checked={form.hasLift} onChange={(e) => set('hasLift', e.target.checked)} />
              </div>
            </div>
            {user && addressId === 'new' && <Checkbox label="Save this address to my account" checked={form.saveAddress} onChange={(e) => set('saveAddress', e.target.checked)} />}
          </Step>

          <Step n={3} title="Delivery">
            <div className="rounded-lg border border-line bg-surface p-5 text-[0.92rem]">
              {estimate ? (
                <div className="grid gap-1">
                  <p className="font-medium">Estimated delivery {estimate}</p>
                  <p className="text-ink-soft">After your order is confirmed you’ll choose an exact morning or afternoon slot. {cart.items.some((i) => i.installationIncluded) ? 'Installation happens on the same visit.' : ''}</p>
                </div>
              ) : (
                <p className="text-ink-soft">Enter your pincode to see your delivery date.</p>
              )}
            </div>
            <Textarea label="Notes for the delivery team" optional value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Gate code, best time to call, narrow staircase…" maxLength={500} />
            <details className="text-[0.9rem]">
              <summary className="cursor-pointer font-medium text-ink-soft">Buying for a business? Add your GSTIN</summary>
              <Input label="GSTIN" optional value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} error={errors.gstin} maxLength={15} className="mt-3 max-w-xs" />
            </details>
          </Step>

          <Step n={4} title="Payment">
            {/* Methods switched off in the admin are hidden; an offered method that can't be used for this order shows why. */}
            <div className="grid gap-3" role="radiogroup" aria-label="Payment method">
              {cart.payment.online.offered && (
                <PayOption
                  value="ONLINE"
                  selected={method === 'ONLINE'}
                  disabled={!cart.payment.online.available}
                  onSelect={() => setMethod('ONLINE')}
                  icon={<CreditCard className="h-5 w-5" strokeWidth={1.5} />}
                  title="Pay online"
                  body="UPI, credit and debit cards, net banking and wallets, securely through Razorpay."
                  tag={testMode ? 'Test mode' : undefined}
                />
              )}
              {cart.payment.cod.offered && (
                <PayOption
                  value="COD"
                  selected={method === 'COD'}
                  disabled={!cart.payment.cod.available}
                  onSelect={() => setMethod('COD')}
                  icon={<Banknote className="h-5 w-5" strokeWidth={1.5} />}
                  title="Cash on delivery"
                  body={cart.payment.cod.available ? 'Pay when it arrives. We’ll call you to confirm the order before we prepare it.' : cart.payment.cod.reason ?? 'Not available for this order.'}
                />
              )}
              {!cart.payment.online.offered && !cart.payment.cod.offered && (
                <p className="rounded-lg border border-line bg-paper px-4 py-3 text-[0.9rem] text-ink-soft">
                  Checkout is paused for a moment. Please call us on <span className="font-medium text-ink">{settings.store.phone}</span> to place your order.
                </p>
              )}
            </div>
            <Checkbox
              label={
                <>
                  I agree to the{' '}
                  <Link href="/policies/terms" className="underline underline-offset-2" target="_blank">
                    terms of use
                  </Link>{' '}
                  and the{' '}
                  <Link href="/policies/returns" className="underline underline-offset-2" target="_blank">
                    returns policy
                  </Link>
                  .
                </>
              }
              checked={form.acceptTerms}
              onChange={(e) => set('acceptTerms', e.target.checked)}
              aria-invalid={errors.acceptTerms ? true : undefined}
            />
            {errors.acceptTerms && <p className="-mt-3 text-[0.8rem] text-danger">{errors.acceptTerms}</p>}
            <Button type="submit" size="lg" loading={placing} disabled={(!cart.payment.online.available && !cart.payment.cod.available) || cart.issues.some((i) => i.code === 'STOCK')}>
              {method === 'COD' ? `Place order · ${inr(s.total)}` : `Pay ${inr(s.total)}`}
            </Button>
            {cart.payment.online.offered && (
              <p className="flex items-center gap-2 text-[0.8rem] text-muted">
                <ShieldCheck className="h-4 w-4" /> Your payment details go straight to Razorpay. We never see or store your card number.
              </p>
            )}
          </Step>
        </form>

        <aside className="lg:col-span-5">
          <div className="grid gap-5 rounded-xl border border-line bg-surface p-6 lg:sticky lg:top-24">
            <div className="flex items-baseline justify-between">
              <h2 className="display-sm">Your order</h2>
              <Link href="/cart" className="text-[0.85rem] text-accent hover:underline">
                Edit cart
              </Link>
            </div>
            <ul className="grid max-h-[340px] gap-4 overflow-y-auto pr-1">
              {cart.items.map((i) => (
                <li key={i.id} className="flex gap-4">
                  <div className="relative h-20 w-16 shrink-0 overflow-hidden bg-paper-2">
                    <Img image={i.image} sizes="64px" className="object-cover" />
                    <span className="absolute -right-0 -top-0 grid h-5 min-w-5 place-items-center rounded-bl-md bg-ink px-1 text-[0.68rem] text-paper">{i.quantity}</span>
                  </div>
                  <div className="min-w-0 flex-1 text-[0.88rem]">
                    <p className="truncate font-medium">{i.name}</p>
                    <p className="truncate text-muted">{i.variantTitle}</p>
                    {i.notices.length > 0 && <p className="text-danger">Not enough stock</p>}
                  </div>
                  <p className="text-[0.9rem] tabular">{inr(i.lineTotal)}</p>
                </li>
              ))}
            </ul>
            <dl className="grid gap-2.5 border-t border-line pt-5 text-[0.9rem]">
              <div className="flex justify-between"><dt className="text-ink-soft">Subtotal</dt><dd className="tabular">{inr(s.subtotal)}</dd></div>
              {s.discount > 0 && <div className="flex justify-between text-accent"><dt>Coupon {cart.coupon?.code}</dt><dd className="tabular">−{inr(s.discount)}</dd></div>}
              <div className="flex justify-between"><dt className="text-ink-soft">Delivery and installation</dt><dd className="tabular">{delivery?.serviceable ? (s.delivery ? inr(s.delivery) : 'Free') : '—'}</dd></div>
              <div className="flex items-baseline justify-between border-t border-line pt-4"><dt className="font-medium">Total</dt><dd className="text-xl font-medium tabular">{inr(s.total)}</dd></div>
              <p className="text-[0.78rem] text-muted">Includes {inr(s.taxIncluded)} GST · a GST invoice is emailed with your confirmation</p>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-5" aria-labelledby={`step-${n}`}>
      <h2 id={`step-${n}`} className="flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-[0.82rem] font-semibold text-paper">{n}</span>
        <span className="display-sm">{title}</span>
      </h2>
      <div className="grid gap-5 sm:pl-11">{children}</div>
    </section>
  );
}

function PayOption({ selected, disabled, onSelect, icon, title, body, tag }: { value: string; selected: boolean; disabled: boolean; onSelect: () => void; icon: React.ReactNode; title: string; body: string; tag?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      onClick={() => !disabled && onSelect()}
      className={clsx(
        'flex items-start gap-4 rounded-lg border p-5 text-left transition-colors',
        selected ? 'border-ink bg-surface ring-1 ring-ink' : 'border-line-strong',
        disabled ? 'cursor-not-allowed opacity-55' : 'hover:border-ink',
      )}
    >
      <span className={clsx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border', selected ? 'border-ink' : 'border-line-strong')}>
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
      </span>
      <span className="grid gap-1">
        <span className="flex items-center gap-2 font-medium">
          {icon} {title}
          {tag && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[0.68rem] font-semibold text-warning">{tag}</span>}
        </span>
        <span className="text-[0.86rem] text-ink-soft">{body}</span>
      </span>
    </button>
  );
}
