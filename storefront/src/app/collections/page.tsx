import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Breadcrumbs } from '@/components/ui/misc';
import { api } from '@/lib/api';
import type { Collection } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Collections',
  description: 'Families of furniture designed to live together: Teak and Linen, Monsoon Velvet and Studio Oak.',
  alternates: { canonical: '/collections' },
};

export default async function CollectionsPage() {
  const collections = await api<Collection[]>('/store/collections', { tags: ['collections'] });
  return (
    <div className="container-x pb-10 pt-8">
      <Breadcrumbs items={[{ label: 'Collections' }]} />
      <h1 className="display-xl mt-6">Collections</h1>
      <div className="mt-12 grid gap-16">
        {collections.map((c, i) => (
          <Link key={c.slug} href={`/collections/${c.slug}`} className={`reveal group grid items-center gap-8 lg:grid-cols-12 ${i % 2 ? 'lg:[&>div:first-child]:order-2' : ''}`}>
            <div className={`relative aspect-[16/11] overflow-hidden bg-paper-2 lg:col-span-7 ${i % 2 ? 'lg:col-start-6' : ''}`}>
              {c.image && <Image src={c.image} alt="" fill sizes="(min-width: 1024px) 58vw, 100vw" priority={i === 0} className="object-cover transition-transform duration-[1.2s] ease-[var(--ease-out-soft)] group-hover:scale-[1.03]" />}
            </div>
            <div className={`grid gap-4 lg:col-span-4 ${i % 2 ? 'lg:col-start-1 lg:row-start-1' : 'lg:col-start-9'}`}>
              <p className="eyebrow">{c.productCount} pieces</p>
              <h2 className="display-lg group-hover:text-accent">{c.name}</h2>
              {c.tagline && <p className="display-sm text-ink-soft">{c.tagline}</p>}
              {c.intro && <p className="text-ink-soft">{c.intro}</p>}
              <span className="mt-2 flex items-center gap-2 font-medium">
                Explore the collection <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" strokeWidth={1.6} />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
