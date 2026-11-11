import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContentBlocks } from '@/components/content/Blocks';
import { ProductRail } from '@/components/product/ProductRail';
import { Img } from '@/components/ui/Img';
import { JsonLd } from '@/components/ui/JsonLd';
import { Breadcrumbs, SectionHeader } from '@/components/ui/misc';
import { api, brand, siteUrl } from '@/lib/api';
import { longDate } from '@/lib/format';
import type { ContentPage, ProductList } from '@/lib/types';

type Params = Promise<{ slug: string }>;

// Pre-rendered on first visit, then served statically and refreshed when the admin publishes a change.
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const p = await api<ContentPage>(`/store/pages/${encodeURIComponent(slug)}`, { tags: ['pages', `page:${slug}`] });
  return {
    title: p.seo.title,
    description: p.excerpt ?? p.seo.description,
    alternates: { canonical: `/guides/${p.slug}` },
    openGraph: { type: 'article', images: p.cover ? [p.cover.url] : undefined },
  };
}

export default async function GuidePage({ params }: { params: Params }) {
  const { slug } = await params;
  const p = await api<ContentPage>(`/store/pages/${encodeURIComponent(slug)}`, { tags: ['pages', `page:${slug}`] });
  if (p.type !== 'GUIDE') notFound();
  const picks = await api<ProductList>('/store/products?sort=bestselling&pageSize=8', { tags: ['products'] });
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: p.title,
    description: p.excerpt,
    image: p.cover ? `${siteUrl}${p.cover.url}` : undefined,
    datePublished: p.publishedAt,
    dateModified: p.updatedAt,
    author: { '@type': 'Organization', name: p.author ?? brand },
    publisher: { '@type': 'Organization', name: brand },
  };
  return (
    <>
      <article className="container-x pb-10 pt-8">
        <div className="mx-auto max-w-3xl">
          <Breadcrumbs items={[{ label: 'Guides', href: '/guides' }, { label: p.title }]} />
          <h1 className="display-xl mt-6">{p.title}</h1>
          {p.excerpt && <p className="display-sm mt-5 text-ink-soft">{p.excerpt}</p>}
          <p className="mt-5 text-[0.85rem] text-muted">
            {p.author} · {p.publishedAt ? longDate(p.publishedAt) : ''}
          </p>
        </div>
        {p.cover && (
          <div className="relative mx-auto mt-10 aspect-[16/8] max-w-5xl overflow-hidden bg-paper-2">
            <Img image={p.cover} priority sizes="(min-width: 1024px) 64rem, 100vw" className="object-cover" />
          </div>
        )}
        <div className="mx-auto mt-12 max-w-3xl">
          <ContentBlocks blocks={p.blocks} />
        </div>
      </article>
      <section className="py-16">
        <div className="container-x">
          <SectionHeader eyebrow="Put it into practice" title="Pieces our customers love" />
        </div>
        <ProductRail products={picks.items} className="mt-8" />
      </section>
      <JsonLd data={ld} />
    </>
  );
}
