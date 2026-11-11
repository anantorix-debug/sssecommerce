import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { Listing } from '@/components/listing/Listing';
import { JsonLd } from '@/components/ui/JsonLd';
import { Breadcrumbs } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { breadcrumbLd, fetchListing, itemListLd, listingMeta, type SearchParams } from '@/lib/listing';

interface Category {
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  productCount: number;
  children: { name: string; slug: string; productCount: number }[];
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return listingMeta('/shop', await searchParams, {
    title: 'Shop all furniture',
    description: 'Sofas, beds, dining, storage, study and decor in solid wood and honest fabrics. Delivered on your date and installed by our team.',
  });
}

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const [categories, data] = await Promise.all([api<Category[]>('/store/categories', { tags: ['categories', 'nav'] }), fetchListing({}, sp)]);
  return (
    <div className="container-x pb-10 pt-8">
      <Breadcrumbs items={[{ label: 'Shop' }]} />
      <header className="mt-6 grid gap-4 lg:grid-cols-12 lg:items-end">
        <h1 className="display-xl lg:col-span-7">All furniture</h1>
        <p className="max-w-lg text-[1.02rem] text-ink-soft lg:col-span-5 lg:justify-self-end">
          Every piece is made with seasoned wood, honest fabrics and joinery meant to last. Start with a category, or browse everything below.
        </p>
      </header>

      <nav aria-label="Categories" className="no-scrollbar -mx-[clamp(1rem,4vw,3rem)] mt-10 flex gap-4 overflow-x-auto px-[clamp(1rem,4vw,3rem)] pb-2">
        {categories.map((c) => (
          <Link key={c.slug} href={`/shop/${c.slug}`} className="group grid w-40 shrink-0 gap-2.5 sm:w-48">
            <div className="relative aspect-square overflow-hidden bg-paper-2">
              {c.image && <Image src={c.image} alt="" fill sizes="192px" className="object-cover transition-transform duration-700 group-hover:scale-105" />}
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium group-hover:text-accent">{c.name}</span>
              <span className="text-[0.78rem] text-muted tabular">{c.productCount}</span>
            </div>
          </Link>
        ))}
      </nav>

      <div className="mt-12">
        <Suspense>
          <Listing data={data} base={{}} />
        </Suspense>
      </div>
      <JsonLd data={[breadcrumbLd([{ name: 'Shop', path: '/shop' }]), itemListLd('/shop', data)]} />
    </div>
  );
}
