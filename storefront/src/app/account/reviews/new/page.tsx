'use client';

import clsx from 'clsx';
import { Star } from 'lucide-react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useToast } from '@/components/providers';
import { Button } from '@/components/ui/Button';
import { FormError, Input, Textarea } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/misc';
import { PhotoUpload, type Uploaded } from '@/components/ui/PhotoUpload';
import { call, errorMessage } from '@/lib/client';

interface Eligible {
  orderItemId: string;
  orderNumber: string;
  productName: string;
  productSlug: string;
  variantTitle: string;
  image: string | null;
}

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

function WriteReview() {
  const item = useSearchParams().get('item');
  const router = useRouter();
  const { notify } = useToast();
  const [target, setTarget] = useState<Eligible | null>(null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<Uploaded[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!item) return setError('Choose an item to review from your order page.');
    call<Eligible>(`/me/reviews/eligible/${item}`).then(setTarget).catch((e) => setError(errorMessage(e)));
  }, [item]);

  if (!target) return error ? <FormError message={error} /> : <Skeleton className="h-96" />;

  return (
    <div className="grid max-w-2xl gap-8">
      <header className="flex items-center gap-5">
        <div className="relative h-24 w-20 shrink-0 overflow-hidden bg-paper-2">{target.image && <Image src={target.image} alt="" fill sizes="80px" className="object-cover" />}</div>
        <div>
          <p className="eyebrow">Write a review</p>
          <h1 className="display-md">{target.productName}</h1>
          <p className="text-[0.88rem] text-muted">{target.variantTitle}</p>
        </div>
      </header>
      <form
        className="grid gap-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (!rating) return setError('Choose a star rating.');
          setBusy(true);
          try {
            await call('/me/reviews', { method: 'POST', json: { orderItemId: target.orderItemId, rating, title, body, photos: photos.map((p) => p.key) } });
            notify('Thank you. Your review will appear once it’s checked.');
            router.push(`/account/orders/${target.orderNumber}`);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <FormError message={error} />
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-[0.82rem] font-medium text-ink-soft">Your rating</legend>
          <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)} role="radiogroup">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n > 1 ? 's' : ''}, ${LABELS[n]}`}
                onMouseEnter={() => setHover(n)}
                onClick={() => setRating(n)}
                className="p-1"
              >
                <Star className={clsx('h-8 w-8 transition-colors', (hover || rating) >= n ? 'fill-brass text-brass' : 'text-line-strong')} strokeWidth={1.4} />
              </button>
            ))}
            <span className="ml-3 text-[0.9rem] text-ink-soft">{LABELS[hover || rating]}</span>
          </div>
        </fieldset>
        <Input label="Headline" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Sum it up in a few words" required />
        <Textarea label="Your review" value={body} onChange={(e) => setBody(e.target.value)} maxLength={3000} hint="How does it feel, look and wear? What would you tell a friend?" required />
        <div className="grid gap-2">
          <p className="text-[0.82rem] font-medium text-ink-soft">Photos (optional)</p>
          <PhotoUpload purpose="review" value={photos} onChange={setPhotos} max={4} />
        </div>
        <Button type="submit" size="lg" loading={busy} className="justify-self-start">
          Submit review
        </Button>
      </form>
    </div>
  );
}

export default function NewReviewPage() {
  return (
    <Suspense>
      <WriteReview />
    </Suspense>
  );
}
