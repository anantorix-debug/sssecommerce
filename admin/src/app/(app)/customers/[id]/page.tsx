'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Badge, Card, ErrorBox, Loading, PageHeader, Stat, StatusBadge, Table } from '@/components/ui';
import { date, inr, useApi } from '@/lib/api';

interface Customer {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  createdAt: string;
  marketingOptIn: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
  lifetimeValue: number;
  addresses: { id: string; name: string; line1: string; line2: string | null; city: string; state: string; pincode: string; phone: string; isDefault: boolean }[];
  orders: { id: string; orderNumber: string; status: string; statusLabel: string; grandTotal: number; placedAt: string; paymentMethod: string }[];
  returns: { id: string; returnNumber: string; status: string; createdAt: string }[];
  reviews: { id: string; rating: number; title: string; status: string; product: { name: string } }[];
  _count: { wishlist: number };
}

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { data: c, error } = useApi<Customer>(`/customers/${id}`);
  if (error) return <ErrorBox message={error} />;
  if (!c) return <Loading rows={10} />;
  return (
    <>
      <PageHeader back={{ href: '/customers', label: 'Customers' }} title={c.name ?? c.email} description={`Customer since ${date(c.createdAt)}`} />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Lifetime value" value={inr(c.lifetimeValue)} />
        <Stat label="Orders" value={c.orders.length} />
        <Stat label="Returns" value={c.returns.length} />
        <Stat label="Wishlist" value={c._count.wishlist} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="grid content-start gap-6 xl:col-span-2">
          <Card title="Orders" padded={false}>
            <Table
              rows={c.orders}
              rowHref={(o) => `/orders/${o.id}`}
              columns={[
                { key: 'n', label: 'Order', render: (o) => <Link href={`/orders/${o.id}`} className="font-semibold hover:text-accent">{o.orderNumber}</Link> },
                { key: 'd', label: 'Placed', render: (o) => date(o.placedAt) },
                { key: 'p', label: 'Payment', render: (o) => <Badge tone={o.paymentMethod === 'COD' ? 'warning' : 'info'}>{o.paymentMethod === 'COD' ? 'COD' : 'Online'}</Badge> },
                { key: 's', label: 'Status', render: (o) => <StatusBadge status={o.status} label={o.statusLabel} /> },
                { key: 't', label: 'Total', className: 'text-right', render: (o) => <span className="tabular">{inr(o.grandTotal)}</span> },
              ]}
              empty={<p className="p-8 text-center text-muted">No orders yet.</p>}
            />
          </Card>
          {c.reviews.length > 0 && (
            <Card title="Reviews" padded={false}>
              <ul className="divide-y divide-line">
                {c.reviews.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[0.86rem]">
                    <span>
                      {'★'.repeat(r.rating)} <span className="font-medium">{r.title}</span> <span className="text-muted">· {r.product.name}</span>
                    </span>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="grid content-start gap-6">
          <Card title="Contact">
            <div className="grid gap-1 text-[0.86rem]">
              <p className="select-all">{c.email}</p>
              <p className="select-all">{c.phone ?? 'No phone'}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.hasPassword && <Badge>Password</Badge>}
                {c.googleLinked && <Badge tone="info">Google</Badge>}
                {c.marketingOptIn && <Badge tone="accent">Newsletter</Badge>}
              </div>
            </div>
          </Card>
          <Card title="Addresses">
            {c.addresses.length === 0 ? (
              <p className="text-[0.86rem] text-muted">None saved.</p>
            ) : (
              <ul className="grid gap-3 text-[0.84rem]">
                {c.addresses.map((a) => (
                  <li key={a.id} className="text-ink-soft">
                    <span className="font-medium text-ink">{a.name}</span> {a.isDefault && <Badge tone="accent">Default</Badge>}
                    <br />
                    {a.line1}
                    {a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.pincode}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {c.returns.length > 0 && (
            <Card title="Returns">
              {c.returns.map((r) => (
                <Link key={r.id} href={`/returns/${r.id}`} className="flex justify-between py-1 text-[0.86rem] hover:text-accent">
                  {r.returnNumber} <StatusBadge status={r.status} />
                </Link>
              ))}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
