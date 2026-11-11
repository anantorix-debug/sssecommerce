'use client';

import { Package } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { call } from '@/lib/client';
import { OrderCard, type OrderRow } from '@/components/order/OrderCard';

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  useEffect(() => {
    call<OrderRow[]>('/me/orders').then(setOrders).catch(() => setOrders([]));
  }, []);
  return (
    <div className="grid gap-8">
      <h1 className="display-lg">Orders</h1>
      {!orders && (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}
      {orders?.length === 0 && <EmptyState icon={<Package className="h-6 w-6" strokeWidth={1.4} />} title="No orders yet" body="When you place an order it will appear here, with its delivery slot and invoice." action={<ButtonLink href="/shop">Shop all furniture</ButtonLink>} />}
      {orders && orders.length > 0 && (
        <div className="grid gap-3">
          {orders.map((o) => (
            <OrderCard key={o.orderNumber} order={o} />
          ))}
        </div>
      )}
    </div>
  );
}
