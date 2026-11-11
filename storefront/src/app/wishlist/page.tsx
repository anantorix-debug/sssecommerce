'use client';

import { Heart } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ProductCard, ProductCardSkeleton } from '@/components/product/ProductCard';
import { useSaved, useSession } from '@/components/providers';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/misc';
import { call } from '@/lib/client';
import type { ProductCard as Card } from '@/lib/types';

export default function WishlistPage() {
  const { wishlist } = useSaved();
  const { user, ready } = useSession();
  const [cards, setCards] = useState<Card[] | null>(null);

  useEffect(() => {
    if (!ready) return;
    const ids = [...wishlist];
    if (!ids.length) {
      setCards([]);
      return;
    }
    call<Card[]>(`/store/cards?ids=${ids.join(',')}`).then(setCards).catch(() => setCards([]));
  }, [wishlist, ready]);

  return (
    <div className="container-x pb-10 pt-10">
      <h1 className="display-lg">Wishlist</h1>
      {!user && ready && wishlist.size > 0 && (
        <p className="mt-3 text-ink-soft">
          Saved on this device. <a href="/login?next=/wishlist" className="font-medium text-accent hover:underline">Sign in</a> to keep your wishlist on every device.
        </p>
      )}
      <div className="mt-10">
        {cards === null && (
          <div className="grid grid-cols-2 gap-6 md:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <ProductCardSkeleton key={i} />)}
          </div>
        )}
        {cards?.length === 0 && (
          <EmptyState icon={<Heart className="h-6 w-6" strokeWidth={1.4} />} title="Nothing saved yet" body="Tap the heart on any piece to save it here and compare later." action={<ButtonLink href="/rooms">Browse by room</ButtonLink>} />
        )}
        {cards && cards.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-4">
            {cards.map((c) => (
              <ProductCard key={c.id} product={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
