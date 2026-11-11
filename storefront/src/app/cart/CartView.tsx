'use client';

import { AlertCircle, Minus, Plus, ShieldCheck, ShoppingBag, Tag, Trash2, Truck, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useCart, useSaved } from '@/components/providers';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Img } from '@/components/ui/Img';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { arrivalRange, inr } from '@/lib/format';

export function CartView() {
  const { cart, update, remove, busy, applyCoupon, removeCoupon } = useCart();
  const { toggleWishlist, pincode, setPincode } = useSaved();
  const [code, setCode] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [pin, setPin] = useState(pincode ?? '');

  if (!cart) {
    return (
      <div className="container-x grid gap-6 py-12 lg:grid-cols-12">
        <div className="grid gap-4 lg:col-span-8">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-80 lg:col-span-4" />
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="container-x">
        <EmptyState
          icon={<ShoppingBag className="h-6 w-6" strokeWidth={1.4} />}
          title="Your cart is empty"
          body="Find something you’ll love living with. Start with a room, or see what other people keep coming back for."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <ButtonLink href="/rooms">Shop by room</ButtonLink>
              <ButtonLink href="/shop" variant="secondary">
                Shop all
              </ButtonLink>
            </div>
          }
        />
      </div>
    );
  }

  const s = cart.summary;
  const blocked = cart.issues.some((i) => i.code === 'STOCK');
  const toFree = s.freeDeliveryAbove > 0 ? Math.max(0, s.freeDeliveryAbove - (s.subtotal - s.discount)) : 0;

  return (
    <div className="container-x py-10 lg:py-14">
      <h1 className="display-lg">Your cart</h1>
      <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:gap-14">
        <section className="lg:col-span-8" aria-label="Items">
          {toFree > 0 && (
            <div className="mb-6 flex items-center gap-3 rounded-lg bg-accent-soft px-5 py-4 text-[0.92rem] text-accent-strong">
              <Truck className="h-5 w-5 shrink-0" strokeWidth={1.5} /> You’re {inr(toFree)} away from free delivery and installation.
            </div>
          )}
          <ul className="divide-y divide-line border-y border-line">
            {cart.items.map((item) => (
              <li key={item.id} className="grid grid-cols-[96px_1fr] gap-5 py-6 sm:grid-cols-[140px_1fr]">
                <Link href={`/products/${item.slug}`} className="relative aspect-[4/5] overflow-hidden bg-paper-2">
                  <Img image={item.image} sizes="140px" className="object-cover" />
                </Link>
                <div className="grid content-start gap-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Link href={`/products/${item.slug}`} className="font-medium hover:text-accent">
                        {item.name}
                      </Link>
                      <p className="text-[0.85rem] text-muted">{item.variantTitle}</p>
                      <p className="text-[0.78rem] text-muted">SKU {item.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="tabular">{inr(item.lineTotal)}</p>
                      {item.quantity > 1 && <p className="text-[0.78rem] text-muted tabular">{inr(item.unitPrice)} each</p>}
                    </div>
                  </div>
                  {item.notices.length > 0 && (
                    <p className="flex items-center gap-2 text-[0.85rem] text-danger">
                      <AlertCircle className="h-4 w-4" />
                      {item.notices.includes('OUT_OF_STOCK') || item.notices.includes('UNAVAILABLE')
                        ? 'No longer available. Remove it to continue.'
                        : `Only ${item.maxQuantity} available. Reduce the quantity to continue.`}
                    </p>
                  )}
                  {item.installationIncluded && <p className="text-[0.82rem] text-ink-soft">Installation included</p>}
                  {item.leadTimeDays > 0 && <p className="text-[0.82rem] text-ink-soft">Made to order: allow {item.leadTimeDays} extra days</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    <div className="flex items-center rounded-full border border-line-strong">
                      <button className="grid h-9 w-9 place-items-center disabled:opacity-30" disabled={busy || item.quantity <= 1} onClick={() => update(item.id, item.quantity - 1)} aria-label={`Reduce quantity of ${item.name}`}>
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center text-[0.9rem] tabular">{item.quantity}</span>
                      <button className="grid h-9 w-9 place-items-center disabled:opacity-30" disabled={busy || item.quantity >= Math.max(1, item.maxQuantity)} onClick={() => update(item.id, item.quantity + 1)} aria-label={`Increase quantity of ${item.name}`}>
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={async () => {
                        toggleWishlist(item.productId, item.name);
                        await remove(item.id);
                      }}
                      className="text-[0.85rem] text-ink-soft underline-offset-4 hover:underline"
                    >
                      Save for later
                    </button>
                    <button onClick={() => remove(item.id)} className="flex items-center gap-1.5 text-[0.85rem] text-ink-soft hover:text-danger">
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside className="lg:col-span-4">
          <div className="grid gap-6 rounded-xl border border-line bg-surface p-6 lg:sticky lg:top-24">
            <h2 className="display-sm">Order summary</h2>

            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (/^[1-9]\d{5}$/.test(pin)) setPincode(pin);
              }}
            >
              <label htmlFor="cart-pin" className="text-[0.82rem] font-medium text-ink-soft">
                Delivery pincode
              </label>
              <div className="flex gap-2">
                <input id="cart-pin" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className="h-11 min-w-0 flex-1 rounded-md border border-line-strong bg-paper px-3" placeholder="6-digit pincode" />
                <Button type="submit" variant="secondary" size="sm" className="h-11">
                  Check
                </Button>
              </div>
              {cart.delivery?.serviceable && cart.delivery.estimate && (
                <p className="text-[0.82rem] text-success">
                  Delivers to {cart.delivery.city ?? cart.delivery.pincode}, {arrivalRange(cart.delivery.estimate.from, cart.delivery.estimate.to)}
                </p>
              )}
              {cart.delivery && !cart.delivery.serviceable && <p className="text-[0.82rem] text-danger">We don’t deliver to {cart.delivery.pincode} yet.</p>}
            </form>

            {cart.coupon?.valid ? (
              <div className="flex items-center justify-between rounded-md bg-accent-soft px-4 py-3 text-[0.88rem] text-accent-strong">
                <span className="flex items-center gap-2">
                  <Tag className="h-4 w-4" /> {cart.coupon.message}
                </span>
                <button onClick={removeCoupon} aria-label="Remove coupon" className="p-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <form
                className="grid gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!code.trim()) return;
                  setApplying(true);
                  setCouponError(await applyCoupon(code.trim()));
                  setApplying(false);
                }}
              >
                <label htmlFor="coupon" className="text-[0.82rem] font-medium text-ink-soft">
                  Coupon code
                </label>
                <div className="flex gap-2">
                  <input id="coupon" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="h-11 min-w-0 flex-1 rounded-md border border-line-strong bg-paper px-3 uppercase tracking-wider" placeholder="e.g. WELCOME10" />
                  <Button type="submit" variant="secondary" size="sm" className="h-11" loading={applying}>
                    Apply
                  </Button>
                </div>
                {couponError && <p className="text-[0.82rem] text-danger">{couponError}</p>}
              </form>
            )}

            <dl className="grid gap-3 border-t border-line pt-5 text-[0.92rem]">
              <Row label={`Subtotal (${cart.itemCount} ${cart.itemCount === 1 ? 'item' : 'items'})`} value={inr(s.subtotal)} />
              {s.savings > 0 && <Row label="You save on MRP" value={`−${inr(s.savings)}`} tone="clay" />}
              {s.discount > 0 && <Row label="Coupon discount" value={`−${inr(s.discount)}`} tone="accent" />}
              <Row label="Delivery and installation" value={cart.delivery?.serviceable ? (s.delivery === 0 ? 'Free' : inr(s.delivery)) : 'Calculated at checkout'} />
              <div className="flex items-baseline justify-between border-t border-line pt-4">
                <dt className="font-medium">Total</dt>
                <dd className="text-xl font-medium tabular">{inr(s.total)}</dd>
              </div>
              <p className="-mt-1 text-[0.78rem] text-muted">Includes {inr(s.taxIncluded)} GST</p>
            </dl>

            <ButtonLink href="/checkout" size="lg" aria-disabled={blocked} className={blocked ? 'pointer-events-none opacity-45' : ''}>
              Checkout
            </ButtonLink>
            {blocked && <p className="-mt-3 text-center text-[0.82rem] text-danger">Fix the items marked above to continue.</p>}
            <p className="flex items-center justify-center gap-2 text-[0.78rem] text-muted">
              <ShieldCheck className="h-4 w-4" /> Secure checkout · UPI, cards, net banking{cart.payment.cod.available ? ' or cash on delivery' : ''}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'clay' | 'accent' }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className={`tabular ${tone === 'clay' ? 'text-clay' : tone === 'accent' ? 'text-accent' : ''}`}>{value}</dd>
    </div>
  );
}
