'use client';

import clsx from 'clsx';
import { Banknote, Check, ChevronDown, Heart, MapPin, Minus, Phone, Plus, RotateCcw, ShieldCheck, Truck, Wrench } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { call } from '@/lib/client';
import { deliveryBy, dims, inr, listJoin } from '@/lib/format';
import type { Delivery, ProductDetail } from '@/lib/types';
import { useCart, useSaved, useSettings } from '../providers';
import { Button } from '../ui/Button';
import { Price, Stars } from '../ui/misc';
import { Gallery } from './Gallery';

interface Availability {
  variantId: string;
  available: number;
  inStock: boolean;
  lowStock: boolean;
  maxQuantity: number;
  delivery: Delivery | null;
}

export function ProductView({ product: p }: { product: ProductDetail }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { add, busy } = useCart();
  const { wishlist, toggleWishlist, pincode, setPincode } = useSaved();
  const settings = useSettings();

  // Initial selection: ?finish= / ?variant= from the URL, else the default variant
  const initial = useMemo(() => {
    const byId = p.variants.find((v) => v.id === params.get('variant'));
    if (byId) return byId;
    const finish = params.get('finish');
    if (finish) {
      const val = p.options.flatMap((o) => o.values).find((v) => v.value.toLowerCase() === finish.toLowerCase());
      const match = val && p.variants.find((v) => v.optionValueIds.includes(val.id));
      if (match) return match;
    }
    return p.variants.find((v) => v.isDefault) ?? p.variants[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  const [selection, setSelection] = useState<Record<string, string>>(() =>
    Object.fromEntries(p.options.map((o) => [o.id, o.values.find((v) => initial?.optionValueIds.includes(v.id))?.id ?? o.values[0].id])),
  );
  const variant = useMemo(
    () => p.variants.find((v) => Object.values(selection).every((id) => v.optionValueIds.includes(id))) ?? null,
    [selection, p.variants],
  );
  const [qty, setQty] = useState(1);
  const [avail, setAvail] = useState<Availability | null>(null);
  const [pinInput, setPinInput] = useState(pincode ?? '');
  const [pinError, setPinError] = useState<string | null>(null);
  const [editingPin, setEditingPin] = useState(false);
  const buyRef = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);

  useEffect(() => setPinInput(pincode ?? ''), [pincode]);

  // Live stock and delivery date (never cached)
  useEffect(() => {
    if (!variant) return;
    let cancelled = false;
    setAvail(null);
    call<Availability>(`/store/variants/${variant.id}/availability${pincode ? `?pincode=${pincode}` : ''}`)
      .then((a) => !cancelled && setAvail(a))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [variant, pincode]);

  // Keep the chosen variant in the URL so it can be shared; canonical stays the plain product URL.
  useEffect(() => {
    if (!variant) return;
    const q = new URLSearchParams(params.toString());
    q.delete('finish');
    if (variant.id === (p.variants.find((v) => v.isDefault) ?? p.variants[0]).id) q.delete('variant');
    else q.set('variant', variant.id);
    const next = q.toString() ? `${pathname}?${q}` : pathname;
    if (next !== `${pathname}${params.toString() ? `?${params}` : ''}`) window.history.replaceState(null, '', next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  // Sticky buy bar once the main button scrolls away
  useEffect(() => {
    const el = buyRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShowBar(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const finishOption = p.options.find((o) => o.values.some((v) => v.hex));
  const finishValue = finishOption?.values.find((v) => v.id === selection[finishOption.id]) ?? null;
  const images = useMemo(() => {
    const own = p.media.filter((m) => m.optionValueId && m.optionValueId === finishValue?.id);
    const general = p.media.filter((m) => !m.optionValueId);
    return [...own, ...general].filter((m, i, arr) => arr.findIndex((x) => x.url === m.url) === i);
  }, [p.media, finishValue]);

  const isAvailable = (optionId: string, valueId: string) => {
    const trial = { ...selection, [optionId]: valueId };
    return p.variants.some((v) => Object.values(trial).every((id) => v.optionValueIds.includes(id)));
  };

  const checkPincode = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    if (!/^[1-9]\d{5}$/.test(pinInput)) return setPinError('Enter a valid 6-digit pincode.');
    setEditingPin(false);
    if (pinInput !== pincode) setPincode(pinInput); // re-runs the availability check with the new pincode
  };

  const saved = wishlist.has(p.id);
  const outOfStock = avail ? !avail.inStock : false;
  const maxQty = avail ? Math.max(1, avail.maxQuantity) : variant?.maxPerOrder ?? 1;
  const delivery = avail?.delivery;
  // "Tiruchengodu, Namakkal" for India Post places; the listed city for our own pincodes.
  const placeLabel = delivery?.serviceable ? [delivery.area, delivery.city].filter((x, i, a): x is string => Boolean(x) && a.indexOf(x) === i).join(', ') : '';
  const freeDelivery = delivery?.serviceable ? (delivery.deliveryFee ?? 0) === 0 || (variant ? variant.price * qty >= settings.freeDeliveryAbove : false) : false;

  const addToCart = async (buyNow = false) => {
    if (!variant) return;
    const ok = await add(variant.id, qty, { silent: buyNow });
    if (ok && buyNow) router.push('/checkout');
  };

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
      <div className="lg:col-span-7">
        <div className="lg:sticky lg:top-24">
          <Gallery name={p.name} images={images} model={p.model3d} variantName={finishValue?.modelVariant ?? null} />
        </div>
      </div>

      <div className="grid content-start gap-7 lg:col-span-5">
        <header className="grid gap-3">
          {p.badge && <p className="eyebrow text-clay">{p.badge}</p>}
          <h1 className="display-lg">{p.name}</h1>
          {p.tagline && <p className="text-[1.05rem] text-ink-soft">{p.tagline}</p>}
          {p.rating.count > 0 && (
            <a href="#reviews" className="flex items-center gap-2 text-[0.85rem] text-muted hover:text-ink">
              <Stars value={p.rating.average} /> {p.rating.average.toFixed(1)} · {p.rating.count} review{p.rating.count > 1 ? 's' : ''}
            </a>
          )}
        </header>

        <div className="grid gap-1">
          {variant ? <Price price={variant.price} mrp={variant.mrp} size="lg" /> : <p className="text-muted">This combination isn’t available.</p>}
          <p className="text-[0.8rem] text-muted">Inclusive of all taxes</p>
        </div>

        {/* Options */}
        {p.options.map((o) => {
          const isFinish = o.values.some((v) => v.hex);
          const chosen = o.values.find((v) => v.id === selection[o.id]);
          return (
            <fieldset key={o.id} className="grid gap-3">
              <legend className="mb-3 text-[0.88rem]">
                <span className="font-medium">{o.name}</span>
                {chosen && <span className="text-ink-soft">: {chosen.value}</span>}
              </legend>
              <div className="flex flex-wrap gap-2.5">
                {o.values.map((v) => {
                  const ok = isAvailable(o.id, v.id);
                  const active = selection[o.id] === v.id;
                  return isFinish ? (
                    <button
                      key={v.id}
                      onClick={() => setSelection((s) => ({ ...s, [o.id]: v.id }))}
                      aria-pressed={active}
                      aria-label={`${v.value}${ok ? '' : ', not available in this size'}`}
                      title={ok ? v.value : `${v.value} isn’t available in this combination`}
                      className={clsx('relative h-11 w-11 rounded-full p-[3px] ring-offset-2 ring-offset-paper transition-shadow', active ? 'ring-[1.5px] ring-ink' : 'hover:ring-1 hover:ring-line-strong', !ok && 'opacity-40')}
                    >
                      <span className="block h-full w-full rounded-full border border-black/10" style={{ background: v.hex ?? '#ddd' }} />
                      {!ok && <span className="absolute left-1/2 top-1/2 h-px w-10 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-ink/60" />}
                    </button>
                  ) : (
                    <button
                      key={v.id}
                      onClick={() => setSelection((s) => ({ ...s, [o.id]: v.id }))}
                      aria-pressed={active}
                      disabled={!ok}
                      title={ok ? undefined : 'Not available with the chosen finish'}
                      className={clsx('min-w-20 rounded-full border px-5 py-2.5 text-[0.88rem] transition-colors', active ? 'border-ink bg-ink text-paper' : 'border-line-strong hover:border-ink', !ok && 'cursor-not-allowed line-through opacity-40')}
                    >
                      {v.value}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        {variant && dims(variant.dimensions) && (
          <p className="-mt-2 text-[0.85rem] text-muted">
            W × D × H: <span className="tabular text-ink-soft">{dims({ length: variant.dimensions.length, width: variant.dimensions.width, height: variant.dimensions.height })}</span>
          </p>
        )}

        {/* Delivery check, Flipkart-style: deliver-to row, then "Delivery by <date> | <fee>" and services */}
        <div className="grid gap-4 rounded-xl border border-line bg-surface p-5">
          <p className="text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-muted">Delivery and services</p>

          {pincode && !editingPin ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-paper px-3.5 py-3">
              <span className="flex min-w-0 items-center gap-3">
                <MapPin className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.7} />
                <span className="min-w-0">
                  <span className="block text-[0.72rem] text-muted">Deliver to</span>
                  <span className="block truncate text-[0.95rem] font-semibold">
                    {pincode}
                    {placeLabel && <span className="font-normal text-ink-soft"> · {placeLabel}</span>}
                  </span>
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditingPin(true);
                  setPinInput('');
                  setPinError(null);
                }}
                className="shrink-0 rounded-md px-2 py-1 text-[0.85rem] font-semibold text-accent hover:bg-accent-soft"
              >
                Change
              </button>
            </div>
          ) : (
            <form onSubmit={checkPincode} className="flex h-12 items-center gap-2.5 rounded-lg border border-line-strong bg-surface pl-3.5 pr-1.5 transition-colors focus-within:border-ink">
              <MapPin className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.7} />
              <label htmlFor="pdp-pin" className="sr-only">
                Delivery pincode
              </label>
              <input
                id="pdp-pin"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={6}
                value={pinInput}
                autoFocus={editingPin}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter delivery pincode"
                className="min-w-0 flex-1 bg-transparent text-[0.95rem] tracking-[0.04em] placeholder:tracking-normal placeholder:text-muted focus:outline-none"
                aria-invalid={pinError ? true : undefined}
              />
              {editingPin && pincode && (
                <button type="button" onClick={() => setEditingPin(false)} className="px-2 text-[0.82rem] text-muted hover:text-ink">
                  Cancel
                </button>
              )}
              <button type="submit" className="h-9 rounded-md bg-ink px-4 text-[0.85rem] font-semibold text-paper transition-colors hover:bg-accent disabled:opacity-40" disabled={pinInput.length !== 6}>
                Check
              </button>
            </form>
          )}
          {pinError && <p className="-mt-2 text-[0.8rem] text-danger">{pinError}</p>}

          <div className="grid gap-3 text-[0.9rem]">
            {pincode && !avail && (
              <div className="grid gap-2">
                <div className="skeleton h-4 w-3/5" />
                <div className="skeleton h-4 w-2/5" />
              </div>
            )}

            {delivery && !delivery.serviceable && (
              <div className="grid gap-2 rounded-lg border border-danger/25 bg-danger/[0.04] px-3.5 py-3">
                <p className="font-medium text-danger">
                  {delivery.reason === 'INVALID' ? 'Not a valid pincode. Please check and try again.' : `We can’t deliver to ${delivery.pincode} online right now.`}
                </p>
                {delivery.reason !== 'INVALID' && (
                  <a href={`tel:${settings.store.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 text-[0.85rem] font-medium text-ink hover:text-accent">
                    <Phone className="h-4 w-4 text-accent" /> Call {settings.store.phone}, we may still be able to deliver
                  </a>
                )}
              </div>
            )}

            {delivery?.serviceable && delivery.estimate && (
              <div className="flex items-start gap-3">
                <Truck className="mt-0.5 h-5 w-5 shrink-0 text-ink-soft" strokeWidth={1.5} />
                <div>
                  <p>
                    <span className="font-semibold text-ink">Delivery by {deliveryBy(delivery.estimate.to)}</span>
                    <span className="mx-2 text-line-strong">|</span>
                    {freeDelivery ? (
                      <>
                        <span className="font-semibold text-success">Free</span>
                        {(delivery.deliveryFee ?? 0) > 0 && <span className="ml-1.5 text-[0.82rem] text-muted line-through tabular">{inr(delivery.deliveryFee!)}</span>}
                      </>
                    ) : (
                      <span className="font-medium tabular text-ink">{inr(delivery.deliveryFee ?? 0)}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[0.8rem] text-muted">
                    {variant && variant.leadTimeDays > 0 ? `Made to order: includes ${variant.leadTimeDays} days in our workshop.` : `Earliest ${deliveryBy(delivery.estimate.from)}. You pick the exact date after ordering.`}
                    {!freeDelivery && settings.freeDeliveryAbove > 0 && <> Free delivery on orders above {inr(settings.freeDeliveryAbove)}.</>}
                  </p>
                </div>
              </div>
            )}

            {delivery?.serviceable && (
              <>
                <p className="flex items-center gap-3 text-ink-soft">
                  <Banknote className="h-5 w-5 shrink-0" strokeWidth={1.5} />
                  {delivery.codAvailable ? <span>Cash on delivery available</span> : <span>Pay online: UPI, cards, net banking</span>}
                </p>
                {delivery.installationIncluded && (
                  <p className="flex items-center gap-3 text-ink-soft">
                    <Wrench className="h-5 w-5 shrink-0" strokeWidth={1.5} /> Free installation by our team
                  </p>
                )}
              </>
            )}

            {avail && (
              <p className={clsx('flex items-center gap-3', outOfStock ? 'text-danger' : avail.lowStock ? 'text-warning' : 'text-success')}>
                <span className="grid h-5 w-5 place-items-center">
                  <span className={clsx('h-2 w-2 rounded-full', outOfStock ? 'bg-danger' : avail.lowStock ? 'bg-warning' : 'bg-success')} />
                </span>
                {outOfStock ? 'Out of stock in this finish' : avail.lowStock ? `Hurry, only ${avail.available} left` : 'In stock'}
              </p>
            )}
            {!pincode && <p className="text-[0.82rem] text-muted">Enter your pincode to see the delivery date, charges and cash-on-delivery options.</p>}
          </div>
        </div>

        {/* Buy */}
        <div ref={buyRef} className="grid gap-3">
          <div className="flex gap-3">
            <div className="flex items-center rounded-full border border-line-strong" role="group" aria-label="Quantity">
              <button className="grid h-[3.25rem] w-11 place-items-center disabled:opacity-30" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease quantity">
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-6 text-center tabular" aria-live="polite">
                {qty}
              </span>
              <button className="grid h-[3.25rem] w-11 place-items-center disabled:opacity-30" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={qty >= maxQty} aria-label="Increase quantity">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <Button size="lg" className="flex-1" onClick={() => addToCart()} loading={busy} disabled={!variant || outOfStock}>
              {outOfStock ? 'Out of stock' : 'Add to cart'}
            </Button>
            <button
              onClick={() => toggleWishlist(p.id, p.name)}
              aria-pressed={saved}
              aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
              className="grid h-[3.25rem] w-[3.25rem] shrink-0 place-items-center rounded-full border border-line-strong hover:border-ink"
            >
              <Heart className={clsx('h-5 w-5', saved && 'fill-clay text-clay')} strokeWidth={1.5} />
            </button>
          </div>
          <Button size="lg" variant="secondary" onClick={() => addToCart(true)} disabled={!variant || outOfStock || busy}>
            Buy now
          </Button>
        </div>

        <ul className="grid gap-3 text-[0.88rem] text-ink-soft">
          <li className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-accent" strokeWidth={1.4} /> {Math.round(p.warrantyMonths / 12)}-year warranty on frame and joinery
          </li>
          <li className="flex items-center gap-3">
            <RotateCcw className="h-5 w-5 text-accent" strokeWidth={1.4} /> {p.returnable ? `${p.returnWindowDays}-day returns, collected from your home` : 'This item can’t be returned'}
          </li>
          <li className="flex items-center gap-3">
            <Check className="h-5 w-5 text-accent" strokeWidth={1.4} /> {p.installationIncluded ? 'Delivered, assembled and placed by our team' : p.assemblyRequired ? 'Easy assembly, tools included' : 'Arrives ready to use'}
          </li>
        </ul>

        <Details product={p} variant={variant} />
      </div>

      {/* Sticky purchase bar */}
      <div
        className={clsx(
          'fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur-xl transition-transform duration-500 ease-[var(--ease-out-soft)]',
          showBar ? 'translate-y-0' : 'translate-y-full',
        )}
        aria-hidden={!showBar}
      >
        <div className="container-x flex items-center gap-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="hidden min-w-0 flex-1 sm:block">
            <p className="truncate font-medium">{p.name}</p>
            <p className="truncate text-[0.82rem] text-muted">{variant?.title}</p>
          </div>
          {variant && <Price price={variant.price} mrp={variant.mrp} className="max-sm:flex-1" />}
          <Button onClick={() => addToCart()} loading={busy} disabled={!variant || outOfStock} tabIndex={showBar ? 0 : -1}>
            {outOfStock ? 'Out of stock' : 'Add to cart'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Details({ product: p, variant }: { product: ProductDetail; variant: ProductDetail['variants'][number] | null }) {
  const settings = useSettings();
  const d = variant?.dimensions;
  return (
    <div className="divide-y divide-line border-y border-line">
      <Section title="Overview" open>
        <p className="whitespace-pre-line">{p.description}</p>
        {p.attributes.length > 0 && (
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-[0.88rem]">
            {p.attributes.map((a) => (
              <div key={a.key}>
                <dt className="text-muted">{a.label}</dt>
                <dd className="text-ink">{a.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>
      {d && d.width && (
        <Section title="Dimensions">
          <DimensionDiagram length={d.length ?? 0} width={d.width} height={d.height ?? 0} />
          <dl className="mt-4 grid grid-cols-3 gap-4 text-[0.88rem]">
            <div>
              <dt className="text-muted">Width</dt>
              <dd className="tabular">{d.length} cm</dd>
            </div>
            <div>
              <dt className="text-muted">Depth</dt>
              <dd className="tabular">{d.width} cm</dd>
            </div>
            <div>
              <dt className="text-muted">Height</dt>
              <dd className="tabular">{d.height} cm</dd>
            </div>
            {variant?.weightKg && (
              <div>
                <dt className="text-muted">Weight</dt>
                <dd className="tabular">{variant.weightKg} kg</dd>
              </div>
            )}
          </dl>
          <p className="mt-4 text-[0.85rem]">Check that your door, lift and stairway are at least 10 cm wider than the depth. If you’re unsure, send us a photo and we’ll check for you.</p>
        </Section>
      )}
      {(p.materials || p.careInfo) && (
        <Section title="Materials and care">
          {p.materials && <p>{p.materials}</p>}
          {p.careInfo && <p className="mt-3">{p.careInfo}</p>}
        </Section>
      )}
      <Section title="Delivery and installation">
        <p>
          {settings.deliversAllIndia ? 'We deliver across India.' : `We deliver${settings.deliveryCities.length > 0 ? ` in ${listJoin(settings.deliveryCities)}` : ''} with our own team.`} After your order is confirmed you choose a morning or afternoon slot. {p.installationIncluded ? 'We assemble and place this piece, and take the packaging away.' : 'This piece arrives ready to use or with simple assembly.'}
        </p>
      </Section>
      <Section title="Returns and warranty">
        <p>
          {p.returnable
            ? `If it isn’t right, request a return within ${p.returnWindowDays} days of delivery. We collect it, inspect it and refund you.`
            : 'This item is not returnable.'}{' '}
          It is covered by a {Math.round(p.warrantyMonths / 12)}-year warranty against manufacturing defects.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="group" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="h-4 w-4 transition-transform duration-300 group-open:rotate-180" strokeWidth={1.6} />
      </summary>
      <div className="pb-5 text-[0.95rem] leading-relaxed text-ink-soft">{children}</div>
    </details>
  );
}

/** A simple isometric box with width, depth and height marked. */
function DimensionDiagram({ length, width, height }: { length: number; width: number; height: number }) {
  return (
    <svg viewBox="0 0 320 170" className="w-full max-w-sm text-ink" role="img" aria-label={`${length} cm wide, ${width} cm deep, ${height} cm high`}>
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        <path d="M60 60 L200 60 L260 30 L120 30 Z" opacity="0.5" />
        <path d="M60 60 L60 130 L200 130 L200 60" />
        <path d="M200 130 L260 100 L260 30" />
      </g>
      <g stroke="var(--color-accent)" strokeWidth="1" fill="none">
        <path d="M60 148 L200 148" />
        <path d="M60 143 v10 M200 143 v10" />
        <path d="M210 140 L270 110" />
        <path d="M276 30 L276 100" />
        <path d="M271 30 h10 M271 100 h10" />
      </g>
      <g fill="var(--color-ink)" fontSize="12" fontFamily="inherit">
        <text x="130" y="165" textAnchor="middle">{length} cm</text>
        <text x="244" y="140" textAnchor="start">{width} cm</text>
        <text x="284" y="70">{height} cm</text>
      </g>
    </svg>
  );
}
