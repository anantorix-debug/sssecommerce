import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { inr, longDate } from '@/lib/format';
import type { OrderStatus } from '@/lib/types';
import { StatusBadge } from './OrderParts';

export interface OrderRow {
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  placedAt: string;
  total: number;
  paymentMethod: string;
  itemCount: number;
  items: { name: string; image: string | null; quantity: number }[];
}

export function OrderCard({ order }: { order: OrderRow }) {
  return (
    <Link href={`/account/orders/${order.orderNumber}`} className="group grid gap-4 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-ink sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="flex items-center gap-4">
        <div className="flex -space-x-4">
          {order.items.slice(0, 3).map((i, idx) => (
            <div key={idx} className="relative h-16 w-16 overflow-hidden rounded-md border-2 border-surface bg-paper-2">
              {i.image && <Image src={i.image} alt="" fill sizes="64px" className="object-cover" />}
            </div>
          ))}
        </div>
        <div className="min-w-0">
          <p className="font-medium">{order.orderNumber}</p>
          <p className="truncate text-[0.85rem] text-muted">
            {longDate(order.placedAt)} · {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'} · {inr(order.total)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <StatusBadge status={order.status} label={order.statusLabel} />
        <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-1 group-hover:text-ink" />
      </div>
    </Link>
  );
}
