import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/api';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/cart', '/checkout', '/account', '/login', '/register', '/forgot-password', '/reset-password', '/wishlist', '/compare', '/search', '/track', '/api/', '/*?*material=', '/*?*finish=', '/*?*minPrice='],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
