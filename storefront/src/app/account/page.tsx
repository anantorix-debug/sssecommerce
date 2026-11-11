'use client';

import { ArrowRight, Heart, MapPin, Package } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { OrderCard, type OrderRow } from '@/components/order/OrderCard';
import { useSession } from '@/components/providers';
import { ButtonLink } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/misc';
import { call } from '@/lib/client';

export default function AccountOverview() {
  const { user } = useSession();
  const [me, setMe] = useState<{ counts: { orders: number; wishlist: number; addresses: number } } | null>(null);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);

  useEffect(() => {
    call<{ counts: { orders: number; wishlist: number; addresses: number } }>('/me').then(setMe).catch(() => undefined);
    call<OrderRow[]>('/me/orders').then(setOrders).catch(() => setOrders([]));
  }, []);

  const first = user?.name?.split(' ')[0];
  const active = orders?.find((o) => !['DELIVERED', 'CANCELLED', 'EXPIRED'].includes(o.status));

  return (
    <div className="grid gap-10">
      <h1 className="display-lg">{first ? `Hello, ${first}` : 'Hello'}</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat href="/account/orders" icon={<Package className="h-5 w-5" />} label="Orders" value={me?.counts.orders} />
        <Stat href="/wishlist" icon={<Heart className="h-5 w-5" />} label="Saved pieces" value={me?.counts.wishlist} />
        <Stat href="/account/addresses" icon={<MapPin className="h-5 w-5" />} label="Addresses" value={me?.counts.addresses} />
      </div>
      <section className="grid gap-4">
        <h2 className="display-sm">{active ? 'In progress' : 'Latest order'}</h2>
        {!orders && <Skeleton className="h-36" />}
        {orders && orders.length === 0 && (
          <div className="grid justify-items-start gap-4 rounded-xl border border-line bg-surface p-6">
            <p className="text-ink-soft">You haven’t ordered anything yet.</p>
            <ButtonLink href="/rooms">Start with a room</ButtonLink>
          </div>
        )}
        {orders && orders.length > 0 && <OrderCard order={active ?? orders[0]} />}
      </section>
    </div>
  );
}

function Stat({ href, icon, label, value }: { href: string; icon: React.ReactNode; label: string; value?: number }) {
  return (
    <Link href={href} className="group grid gap-3 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-ink">
      <span className="text-accent">{icon}</span>
      <span className="flex items-end justify-between">
        <span>
          <span className="block font-[family-name:var(--font-display)] text-3xl tabular">{value ?? '–'}</span>
          <span className="text-[0.88rem] text-ink-soft">{label}</span>
        </span>
        <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-1 group-hover:text-ink" />
      </span>
    </Link>
  );
}
