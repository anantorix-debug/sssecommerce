'use client';

import { ArrowRight, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { call } from '@/lib/client';
import { longDate } from '@/lib/format';

interface Row {
  id: string;
  returnNumber: string;
  status: string;
  orderNumber: string;
  createdAt: string;
}

export default function ReturnsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    call<Row[]>('/me/returns').then(setRows).catch(() => setRows([]));
  }, []);
  return (
    <div className="grid gap-8">
      <h1 className="display-lg">Returns</h1>
      {!rows && <Skeleton className="h-40" />}
      {rows?.length === 0 && <EmptyState icon={<RotateCcw className="h-6 w-6" strokeWidth={1.4} />} title="No returns" body="To return something, open the order and choose “Request a return” within the return window." />}
      {rows && rows.length > 0 && (
        <div className="grid gap-3">
          {rows.map((r) => (
            <Link key={r.id} href={`/account/returns/${r.id}`} className="group flex items-center justify-between rounded-xl border border-line bg-surface p-5 hover:border-ink">
              <div>
                <p className="font-medium">{r.returnNumber}</p>
                <p className="text-[0.85rem] text-muted">
                  Order {r.orderNumber} · requested {longDate(r.createdAt)}
                </p>
              </div>
              <span className="flex items-center gap-3 text-[0.85rem] capitalize text-ink-soft">
                {r.status.replace(/_/g, ' ').toLowerCase()} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
