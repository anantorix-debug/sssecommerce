'use client';

import { Minus, Plus, ShoppingBag, Trash2, Truck } from 'lucide-react';
import Link from 'next/link';
import { inr } from '@/lib/format';
import { useCart } from '../providers';
import { ButtonLink } from '../ui/Button';
import { Img } from '../ui/Img';
import { Sheet } from '../ui/Sheet';

export function MiniCart() {
  const { cart, open, setOpen, update, remove, busy } = useCart();
  const items = cart?.items ?? [];
  const s = cart?.summary;
  const toFree = s && s.freeDeliveryAbove > 0 ? Math.max(0, s.freeDeliveryAbove - (s.subtotal - s.discount)) : 0;

  return (
    <Sheet
      open={open}
      onClose={() => setOpen(false)}
      title={items.length ? `Your cart (${cart!.itemCount})` : 'Your cart'}
      footer={
        items.length ? (
          <div className="grid gap-4">
            <div className="flex items-baseline justify-between">
              <span className="text-ink-soft">Subtotal</span>
              <span className="text-lg font-medium tabular">{inr(s!.subtotal - s!.discount)}</span>
            </div>
            <p className="-mt-2 text-[0.8rem] text-muted">Prices include GST. Delivery is calculated from your pincode at checkout.</p>
            <div className="grid grid-cols-2 gap-3">
              <ButtonLink href="/cart" variant="secondary" onClick={() => setOpen(false)}>
                View cart
              </ButtonLink>
              <ButtonLink href="/checkout" onClick={() => setOpen(false)}>
                Checkout
              </ButtonLink>
            </div>
          </div>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <div className="grid justify-items-center gap-4 px-6 py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-paper-2">
            <ShoppingBag className="h-6 w-6" strokeWidth={1.4} />
          </div>
          <p className="display-sm">Your cart is empty</p>
          <p className="text-ink-soft">Start with a room and we’ll help you build it.</p>
          <ButtonLink href="/rooms" onClick={() => setOpen(false)}>
            Shop by room
          </ButtonLink>
        </div>
      ) : (
        <div className="grid gap-1 px-5 py-4">
          {toFree > 0 && (
            <div className="mb-3 flex items-center gap-3 rounded-md bg-accent-soft px-4 py-3 text-[0.85rem] text-accent-strong">
              <Truck className="h-5 w-5 shrink-0" strokeWidth={1.5} />
              Add {inr(toFree)} more for free delivery and installation.
            </div>
          )}
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id} className="flex gap-4 py-4">
                <Link href={`/products/${item.slug}`} onClick={() => setOpen(false)} className="relative h-24 w-24 shrink-0 overflow-hidden bg-paper-2">
                  <Img image={item.image} sizes="96px" className="object-cover" />
                </Link>
                <div className="grid min-w-0 flex-1 content-start gap-1">
                  <Link href={`/products/${item.slug}`} onClick={() => setOpen(false)} className="truncate font-medium hover:text-accent">
                    {item.name}
                  </Link>
                  <p className="truncate text-[0.82rem] text-muted">{item.variantTitle}</p>
                  {item.notices.length > 0 && (
                    <p className="text-[0.8rem] text-danger">
                      {item.notices.includes('OUT_OF_STOCK') ? 'Out of stock' : `Only ${item.maxQuantity} available`}
                    </p>
                  )}
                  <div className="mt-1 flex items-center justify-between">
                    <div className="flex items-center rounded-full border border-line-strong">
                      <button
                        className="grid h-8 w-8 place-items-center disabled:opacity-40"
                        aria-label={`Reduce quantity of ${item.name}`}
                        disabled={busy || item.quantity <= 1}
                        onClick={() => update(item.id, item.quantity - 1)}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center text-[0.85rem] tabular" aria-label={`Quantity ${item.quantity}`}>
                        {item.quantity}
                      </span>
                      <button
                        className="grid h-8 w-8 place-items-center disabled:opacity-40"
                        aria-label={`Increase quantity of ${item.name}`}
                        disabled={busy || item.quantity >= Math.max(item.maxQuantity, 1)}
                        onClick={() => update(item.id, item.quantity + 1)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="tabular">{inr(item.lineTotal)}</span>
                  </div>
                </div>
                <button onClick={() => remove(item.id)} className="self-start p-1 text-muted hover:text-danger" aria-label={`Remove ${item.name}`}>
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
