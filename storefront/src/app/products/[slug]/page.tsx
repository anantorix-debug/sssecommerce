import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';
import { ProductRail } from '@/components/product/ProductRail';
import { ProductView } from '@/components/product/ProductView';
import { Reviews } from '@/components/product/Reviews';
import { JsonLd } from '@/components/ui/JsonLd';
import { Breadcrumbs, SectionHeader } from '@/components/ui/misc';
import { api, brand, siteUrl } from '@/lib/api';
import type { ProductDetail } from '@/lib/types';

type Params = Promise<{ slug: string }>;

// Pre-rendered on first visit, then served statically and refreshed when the admin publishes a change.
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

const load = (slug: string) => api<ProductDetail>(`/store/products/${encodeURIComponent(slug)}`, { tags: ['products', `product:${slug}`] });

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const p = await load(slug);
  if (p.redirect) return {};
  const image = p.media[0];
  return {
    title: p.seo.title,
    description: p.seo.description,
    alternates: { canonical: `/products/${p.slug}` },
    openGraph: { type: 'website', title: p.name, description: p.seo.description, images: image ? [{ url: image.url, width: image.width ?? undefined, height: image.height ?? undefined, alt: image.alt }] : undefined },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const p = await load(slug);
  if (p.redirect) permanentRedirect(p.redirect);

  const prices = p.variants.map((v) => v.price);
  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.description,
    sku: p.variants[0]?.sku,
    brand: { '@type': 'Brand', name: p.brand || brand },
    category: p.category.name,
    image: p.media.slice(0, 6).map((m) => `${siteUrl}${m.url}`),
    material: p.attributes.find((a) => a.key === 'material')?.value,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'INR',
      lowPrice: (Math.min(...prices) / 100).toFixed(2),
      highPrice: (Math.max(...prices) / 100).toFixed(2),
      offerCount: p.variants.length,
      availability: 'https://schema.org/InStock',
      url: `${siteUrl}/products/${p.slug}`,
    },
    ...(p.rating.count > 0
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating.average, reviewCount: p.rating.count, bestRating: 5, worstRating: 1 } }
      : {}),
    ...(p.reviews.length
      ? { review: p.reviews.slice(0, 3).map((r) => ({ '@type': 'Review', reviewRating: { '@type': 'Rating', ratingValue: r.rating }, author: { '@type': 'Person', name: r.author }, name: r.title, reviewBody: r.body })) }
      : {}),
  };
  const crumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ label: 'Home', href: '/' }, ...p.breadcrumbs, { label: p.name, href: `/products/${p.slug}` }].map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.label, item: `${siteUrl}${b.href}` })),
  };

  return (
    <>
      <div className="container-x pb-6 pt-6">
        <Breadcrumbs items={[...p.breadcrumbs, { label: p.name }]} className="mb-6" />
        <Suspense>
          <ProductView product={p} />
        </Suspense>
      </div>

      <Reviews product={p} />

      {p.completeTheLook.length > 0 && (
        <section className="py-16 lg:py-20">
          <div className="container-x">
            <SectionHeader eyebrow="Seen together" title="Complete the look" />
          </div>
          <ProductRail products={p.completeTheLook} className="mt-8" />
        </section>
      )}
      {p.related.length > 0 && (
        <section className="py-16 lg:py-20">
          <div className="container-x">
            <SectionHeader eyebrow={`More ${p.category.name.toLowerCase()}`} title="You may also like" />
          </div>
          <ProductRail products={p.related} className="mt-8" />
        </section>
      )}
      <JsonLd data={[productLd, crumbLd]} />
    </>
  );
}
