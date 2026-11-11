import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { RevealObserver } from '@/components/motion';
import { CompareBar } from '@/components/product/CompareBar';
import { Providers } from '@/components/providers';
import { JsonLd } from '@/components/ui/JsonLd';
import { api, brand, siteUrl } from '@/lib/api';
import type { Navigation, PublicSettings } from '@/lib/types';
import './globals.css';

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', axes: ['opsz', 'SOFT'], display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${brand} | Teak furniture, sofas and home furnishing in Salem`, template: `%s | ${brand}` },
  description: 'Teak furniture, luxury and recliner sofas, home furnishing and office setups from SSS Furniture, Salem. Delivered on a date you choose and installed by our team.',
  openGraph: { siteName: brand, type: 'website', locale: 'en_IN' },
  twitter: { card: 'summary_large_image' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#F5F3EF',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [settings, nav] = await Promise.all([
    api<PublicSettings>('/store/settings', { tags: ['settings'] }),
    api<Navigation>('/store/navigation', { tags: ['nav'] }),
  ]);

  const orgLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl}/#org`,
        name: settings.store.name,
        legalName: settings.store.legalName,
        url: siteUrl,
        logo: `${siteUrl}/brand/sss-furniture.png`,
        email: settings.store.email,
        telephone: settings.store.phone,
        address: { '@type': 'PostalAddress', streetAddress: settings.store.address, addressCountry: 'IN' },
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#site`,
        url: siteUrl,
        name: settings.store.name,
        potentialAction: { '@type': 'SearchAction', target: `${siteUrl}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
      },
    ],
  };

  return (
    <html lang="en-IN" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:text-paper">
          Skip to content
        </a>
        <Providers settings={settings}>
          <Header nav={nav} />
          <main id="main">{children}</main>
          <Footer settings={settings} />
          <CompareBar />
          <RevealObserver />
        </Providers>
        <JsonLd data={orgLd} />
      </body>
    </html>
  );
}
