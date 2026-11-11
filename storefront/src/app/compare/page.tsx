'use client';

import { GitCompareArrows, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCart, useSaved } from '@/components/providers';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState, Price, Skeleton, Stars } from '@/components/ui/misc';
import { call } from '@/lib/client';
import type { ProductCard } from '@/lib/types';

type Compared = ProductCard & {
  dimensions: { length: number | null; width: number | null; height: number | null } | null;
  weightKg: number | null;
  materials: string | null;
  warrantyMonths: number;
  returnWindowDays: number;
  installationIncluded: boolean;
  attributes: { label: string; value: string }[];
  variantCount: number;
};

export default function ComparePage() {
  const { compare, toggleCompare } = useSaved();
  const { add } = useCart();
  const [items, setItems] = useState<Compared[] | null>(null);

  useEffect(() => {
    if (!compare.length) return setItems([]);
    call<Compared[]>(`/store/compare?ids=${compare.join(',')}`).then(setItems).catch(() => setItems([]));
  }, [compare]);

  if (items === null) return <div className="container-x py-12"><Skeleton className="h-96" /></div>;
  if (items.length === 0) {
    return (
      <div className="container-x">
        <EmptyState icon={<GitCompareArrows className="h-6 w-6" strokeWidth={1.4} />} title="Nothing to compare yet" body="Use the compare button on up to three pieces to see them side by side." action={<ButtonLink href="/shop">Shop all furniture</ButtonLink>} />
      </div>
    );
  }

  const labels = [...new Set(items.flatMap((i) => i.attributes.map((a) => a.label)))];
  const row = (label: string, render: (i: Compared) => React.ReactNode) => (
    <tr className="border-t border-line align-top">
      <th scope="row" className="w-44 py-4 pr-6 text-left text-[0.85rem] font-medium text-muted">{label}</th>
      {items.map((i) => (
        <td key={i.id} className="py-4 pr-6 text-[0.92rem]">{render(i)}</td>
      ))}
    </tr>
  );

  return (
    <div className="container-x pb-10 pt-10">
      <h1 className="display-lg">Compare</h1>
      <p className="mt-2 text-ink-soft">Side by side, so you can choose with confidence.</p>
      <div className="mt-10 overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed border-collapse">
          <thead>
            <tr>
              <th className="w-44" />
              {items.map((i) => (
                <th key={i.id} className="pb-6 pr-6 text-left align-top font-normal">
                  <div className="grid gap-3">
                    <div className="relative aspect-[4/5] overflow-hidden bg-paper-2">
                      {i.image && <Image src={i.image.url} alt={i.name} fill sizes="25vw" className="object-cover" />}
                      <button onClick={() => toggleCompare(i.id, i.name)} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-paper/90" aria-label={`Remove ${i.name} from compare`}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <Link href={`/products/${i.slug}`} className="font-medium hover:text-accent">{i.name}</Link>
                    <Price price={i.price} mrp={i.mrp} size="sm" />
                    {i.defaultVariantId && (
                      <Button size="sm" variant="secondary" onClick={() => add(i.defaultVariantId!)} className="justify-self-start">
                        Add to cart
                      </Button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {row('Rating', (i) => (i.ratingCount ? <span className="flex items-center gap-2"><Stars value={i.ratingAvg} /> ({i.ratingCount})</span> : 'No reviews yet'))}
            {row('Dimensions (W × D × H)', (i) => (i.dimensions?.length ? `${i.dimensions.length} × ${i.dimensions.width} × ${i.dimensions.height} cm` : '—'))}
            {row('Weight', (i) => (i.weightKg ? `${i.weightKg} kg` : '—'))}
            {row('Materials', (i) => i.materials ?? '—')}
            {labels.map((l) => row(l, (i) => i.attributes.find((a) => a.label === l)?.value ?? '—'))}
            {row('Finishes', (i) => (i.swatches.length ? <span className="flex flex-wrap gap-1.5">{i.swatches.map((s) => <span key={s.id} title={s.value} className="h-4 w-4 rounded-full border border-black/10" style={{ background: s.hex ?? '#ddd' }} />)}</span> : '—'))}
            {row('Installation', (i) => (i.installationIncluded ? 'Included' : 'Not needed'))}
            {row('Warranty', (i) => `${Math.round(i.warrantyMonths / 12)} years`)}
            {row('Returns', (i) => (i.returnWindowDays ? `${i.returnWindowDays} days` : 'Not returnable'))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
