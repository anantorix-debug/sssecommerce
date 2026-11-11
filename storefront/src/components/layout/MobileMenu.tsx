'use client';

import { ChevronDown, Heart, MapPin, Package, User } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import type { Navigation } from '@/lib/types';
import { useSaved, useSession } from '../providers';
import { Sheet } from '../ui/Sheet';

export function MobileMenu({ open, onClose, nav, onPincode }: { open: boolean; onClose: () => void; nav: Navigation; onPincode: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { user } = useSession();
  const { pincode } = useSaved();

  return (
    <Sheet open={open} onClose={onClose} title="Menu" side="left" width="min(400px, 92vw)">
      <div className="grid gap-8 px-5 py-6">
        <section>
          <p className="eyebrow mb-3">Shop by room</p>
          <div className="grid grid-cols-2 gap-3">
            {nav.rooms.map((r) => (
              <Link key={r.slug} href={`/rooms/${r.slug}`} onClick={onClose} className="group grid gap-2">
                <div className="relative aspect-[4/3] overflow-hidden bg-paper-2">{r.image && <Image src={r.image} alt="" fill sizes="45vw" className="object-cover" />}</div>
                <span className="text-[0.9rem] font-medium">{r.name}</span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <p className="eyebrow mb-1">Shop by piece</p>
          <ul className="divide-y divide-line">
            {nav.categories.map((c) => (
              <li key={c.slug}>
                <div className="flex items-center justify-between">
                  <Link href={`/shop/${c.slug}`} onClick={onClose} className="flex-1 py-3.5 text-[1.05rem]">
                    {c.name}
                  </Link>
                  {c.children.length > 0 && (
                    <button
                      className="grid h-11 w-11 place-items-center"
                      aria-expanded={expanded === c.slug}
                      aria-label={`Show ${c.name} categories`}
                      onClick={() => setExpanded(expanded === c.slug ? null : c.slug)}
                    >
                      <ChevronDown className={`h-5 w-5 transition-transform ${expanded === c.slug ? 'rotate-180' : ''}`} strokeWidth={1.5} />
                    </button>
                  )}
                </div>
                {expanded === c.slug && (
                  <ul className="grid gap-1 pb-3 pl-4">
                    {c.children.map((ch) => (
                      <li key={ch.slug}>
                        <Link href={`/shop/${c.slug}/${ch.slug}`} onClick={onClose} className="block py-1.5 text-ink-soft">
                          {ch.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <p className="eyebrow mb-1">Collections</p>
          <ul className="divide-y divide-line">
            {nav.collections.map((c) => (
              <li key={c.slug}>
                <Link href={`/collections/${c.slug}`} onClick={onClose} className="block py-3.5 text-[1.05rem]">
                  {c.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/guides" onClick={onClose} className="block py-3.5 text-[1.05rem]">
                Buying guides
              </Link>
            </li>
          </ul>
        </section>

        <section className="grid gap-1 rounded-lg bg-paper-2 p-2">
          <Link href={user ? '/account' : '/login'} onClick={onClose} className="flex items-center gap-3 rounded-md px-3 py-3">
            <User className="h-5 w-5" strokeWidth={1.5} /> {user ? 'Your account' : 'Sign in or create an account'}
          </Link>
          <Link href="/wishlist" onClick={onClose} className="flex items-center gap-3 rounded-md px-3 py-3">
            <Heart className="h-5 w-5" strokeWidth={1.5} /> Wishlist
          </Link>
          <Link href="/track" onClick={onClose} className="flex items-center gap-3 rounded-md px-3 py-3">
            <Package className="h-5 w-5" strokeWidth={1.5} /> Track an order
          </Link>
          <button
            onClick={() => {
              onClose();
              onPincode();
            }}
            className="flex items-center gap-3 rounded-md px-3 py-3 text-left"
          >
            <MapPin className="h-5 w-5" strokeWidth={1.5} /> {pincode ? `Delivering to ${pincode}` : 'Set your delivery pincode'}
          </button>
        </section>
      </div>
    </Sheet>
  );
}
