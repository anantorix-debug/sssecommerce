import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Listing } from '@/components/listing/Listing';
import { JsonLd } from '@/components/ui/JsonLd';
import { Breadcrumbs } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { breadcrumbLd, fetchListing, itemListLd, listingMeta, type SearchParams } from '@/lib/listing';

interface CategoryInfo {
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  parent: { name: string; slug: string } | null;
  subcategories: { name: string; slug: string }[];
}

type Params = Promise<{ slug: string[] }>;

async function load(slugs: string[]) {
  if (slugs.length > 2) notFound();
  const category = await api<CategoryInfo>(`/store/categories/${encodeURIComponent(slugs[slugs.length - 1])}`, { tags: ['categories'] });
  // Keep one URL per category: /shop/parent/child, never /shop/child for a sub-category.
  const path = category.parent ? `/shop/${category.parent.slug}/${category.slug}` : `/shop/${category.slug}`;
  return { category, path };
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const { category, path } = await load((await params).slug);
  return listingMeta(path, await searchParams, {
    title: category.seoTitle ?? `${category.name}`,
    description: category.seoDescription ?? category.description ?? `Shop ${category.name.toLowerCase()} made with seasoned wood and honest fabrics.`,
    openGraph: category.image ? { images: [category.image] } : undefined,
  });
}

export default async function CategoryPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const slugs = (await params).slug;
  const { category, path } = await load(slugs);
  if (`/shop/${slugs.join('/')}` !== path) redirect(path);
  const data = await fetchListing({ category: category.slug }, await searchParams);
  const crumbs = [{ label: 'Shop', href: '/shop' }, ...(category.parent ? [{ label: category.parent.name, href: `/shop/${category.parent.slug}` }] : []), { label: category.name }];
  const parentSlug = category.parent?.slug ?? category.slug;

  return (
    <div className="container-x pb-10 pt-8">
      <Breadcrumbs items={crumbs} />
      <header className="mt-6 grid gap-5 lg:grid-cols-12 lg:items-end">
        <h1 className="display-xl lg:col-span-7">{category.name}</h1>
        {category.description && <p className="max-w-lg text-[1.02rem] text-ink-soft lg:col-span-5 lg:justify-self-end">{category.description}</p>}
      </header>
      {category.subcategories.length > 0 && (
        <nav aria-label={`${category.parent?.name ?? category.name} types`} className="no-scrollbar mt-8 flex gap-2 overflow-x-auto">
          <Chip href={`/shop/${parentSlug}`} active={!category.parent}>
            All {category.parent?.name.toLowerCase() ?? category.name.toLowerCase()}
          </Chip>
          {category.subcategories.map((s) => (
            <Chip key={s.slug} href={`/shop/${parentSlug}/${s.slug}`} active={s.slug === category.slug}>
              {s.name}
            </Chip>
          ))}
        </nav>
      )}
      <div className="mt-10">
        <Suspense>
          <Listing data={data} base={{ category: category.slug }} emptyHint="New pieces are on their way. In the meantime, browse the rest of the shop." />
        </Suspense>
      </div>
      <JsonLd data={[breadcrumbLd([{ name: 'Shop', path: '/shop' }, ...(category.parent ? [{ name: category.parent.name, path: `/shop/${category.parent.slug}` }] : []), { name: category.name, path }]), itemListLd(path, data)]} />
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={`shrink-0 rounded-full border px-4 py-2 text-[0.86rem] transition-colors ${active ? 'border-ink bg-ink text-paper' : 'border-line-strong hover:border-ink'}`}>
      {children}
    </Link>
  );
}
