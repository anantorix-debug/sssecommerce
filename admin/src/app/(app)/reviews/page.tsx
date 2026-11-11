'use client';

import { Star } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, ErrorBox, FilterTabs, Loading, PageHeader, Textarea, useToast } from '@/components/ui';
import { api, dateTime, message, useApi, storefront } from '@/lib/api';

interface Review {
  id: string;
  rating: number;
  title: string;
  body: string;
  photos: string[];
  reply: string | null;
  status: string;
  createdAt: string;
  product: { name: string; slug: string };
  user: { name: string | null; email: string };
  orderItem: { variantTitle: string; order: { orderNumber: string } };
}

export default function ReviewsPage() {
  const toast = useToast();
  const [status, setStatus] = useState('PENDING');
  const { data, error, reload } = useApi<Review[]>(`/reviews?status=${status}`);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const moderate = async (r: Review, next: 'APPROVED' | 'REJECTED') => {
    setBusy(r.id);
    try {
      await api(`/reviews/${r.id}/moderate`, { method: 'POST', json: { status: next, reply: replies[r.id]?.trim() || r.reply || null } });
      toast(next === 'APPROVED' ? 'Published on the product page' : 'Review rejected');
      void reload();
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Reviews" description="Only customers with a delivered item can review it. Nothing appears on the store until you approve it." />
      <div className="mb-4">
        <FilterTabs value={status} onChange={setStatus} options={[{ value: 'PENDING', label: 'To moderate' }, { value: 'APPROVED', label: 'Published' }, { value: 'REJECTED', label: 'Rejected' }]} />
      </div>
      <ErrorBox message={error} />
      {!data ? (
        <Loading />
      ) : data.length === 0 ? (
        <Card><p className="text-center text-muted">{status === 'PENDING' ? 'No reviews waiting. Nice.' : 'Nothing here.'}</p></Card>
      ) : (
        <div className="grid gap-4">
          {data.map((r) => (
            <Card key={r.id}>
              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="grid content-start gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-[0.8rem] text-muted">
                    <span className="flex text-clay" aria-label={`${r.rating} out of 5`}>
                      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`h-4 w-4 ${i <= r.rating ? 'fill-current' : 'text-line-strong'}`} />)}
                    </span>
                    <a href={`${storefront}/products/${r.product.slug}`} target="_blank" rel="noreferrer" className="font-medium text-ink hover:text-accent">{r.product.name}</a>
                    <span>· {r.orderItem.variantTitle} · order {r.orderItem.order.orderNumber}</span>
                  </div>
                  <p className="text-[1rem] font-semibold">{r.title}</p>
                  <p className="text-[0.88rem] text-ink-soft">{r.body}</p>
                  {r.photos.length > 0 && (
                    <div className="flex gap-2">
                      {r.photos.map((src) => <a key={src} href={src} target="_blank" rel="noreferrer" className="h-20 w-20 overflow-hidden rounded-lg border border-line"><img src={src} alt="Customer photo" className="h-full w-full object-cover" /></a>)}
                    </div>
                  )}
                  <p className="text-[0.76rem] text-muted">{r.user.name ?? 'Customer'} ({r.user.email}) · {dateTime(r.createdAt)}</p>
                </div>
                <div className="grid content-start gap-3">
                  <Textarea label="Public reply (optional)" value={replies[r.id] ?? r.reply ?? ''} onChange={(e) => setReplies({ ...replies, [r.id]: e.target.value })} rows={3} placeholder="Thank the customer, or answer their question." />
                  <div className="flex gap-2">
                    {r.status !== 'REJECTED' && <Button variant="danger" onClick={() => moderate(r, 'REJECTED')} loading={busy === r.id}>Reject</Button>}
                    <Button variant="primary" className="flex-1" onClick={() => moderate(r, 'APPROVED')} loading={busy === r.id}>{r.status === 'APPROVED' ? 'Update reply' : 'Approve and publish'}</Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
