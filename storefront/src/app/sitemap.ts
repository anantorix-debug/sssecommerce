import type { MetadataRoute } from 'next';
import { api, siteUrl } from '@/lib/api';

type Entry = { path: string; updatedAt: string };

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await api<Record<'products' | 'categories' | 'rooms' | 'collections' | 'looks' | 'pages', Entry[]>>('/store/sitemap', { tags: ['products', 'pages'], revalidate: 3600 });
  const fixed = ['/', '/shop', '/rooms', '/collections', '/guides', '/faq', '/about', '/contact'].map((path) => ({ url: `${siteUrl}${path}`, changeFrequency: 'daily' as const, priority: path === '/' ? 1 : 0.8 }));
  const map = (list: Entry[], priority: number) => list.map((e) => ({ url: `${siteUrl}${e.path}`, lastModified: new Date(e.updatedAt), priority }));
  return [
    ...fixed,
    ...map(data.categories, 0.8),
    ...map(data.rooms, 0.8),
    ...map(data.collections, 0.7),
    ...map(data.products, 0.9),
    ...map(data.looks, 0.5),
    ...map(data.pages.filter((p) => !['/faq', '/about'].includes(p.path)), 0.4),
  ];
}
