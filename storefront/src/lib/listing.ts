import type { Metadata } from 'next';
import { api, siteUrl } from './api';
import type { ProductList } from './types';

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PASS = ['material', 'finish', 'seating', 'style', 'minPrice', 'maxPrice', 'maxWidth', 'inStock', 'sort', 'page'];

/** Builds the API query for a listing page from its fixed scope plus the visitor's filters. */
export async function fetchListing(scope: Record<string, string>, searchParams: Awaited<SearchParams>) {
  const q = new URLSearchParams(scope);
  for (const key of PASS) {
    const v = searchParams[key];
    if (typeof v === 'string' && v) q.set(key, v);
  }
  q.set('pageSize', '24');
  return api<ProductList>(`/store/products?${q.toString()}`, { tags: ['products'], revalidate: 300 });
}

/** Filtered views point search engines at the unfiltered page; plain pagination stays indexable. */
export function listingMeta(path: string, searchParams: Awaited<SearchParams>, base: Metadata): Metadata {
  const filtered = PASS.filter((k) => k !== 'page' && k !== 'sort').some((k) => searchParams[k]);
  const page = Number(searchParams.page ?? 1);
  const canonical = page > 1 && !filtered ? `${path}?page=${page}` : path;
  return {
    ...base,
    title: page > 1 && typeof base.title === 'string' ? `${base.title}, page ${page}` : base.title,
    alternates: { canonical },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export function itemListLd(path: string, data: ProductList) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    url: `${siteUrl}${path}`,
    numberOfItems: data.total,
    itemListElement: data.items.map((p, i) => ({ '@type': 'ListItem', position: (data.page - 1) * data.pageSize + i + 1, url: `${siteUrl}/products/${p.slug}`, name: p.name })),
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'Home', path: '/' }, ...items].map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: `${siteUrl}${b.path}` })),
  };
}
