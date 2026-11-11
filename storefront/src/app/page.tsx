import type { Metadata } from 'next';
import { Fragment } from 'react';
import { BrandBand } from '@/components/home/BrandBand';
import { Hero } from '@/components/home/Hero';
import {
  CollectionStory,
  GuidesSection,
  LookSection,
  MaterialsSection,
  NewsletterSection,
  PromiseStrip,
  RailSection,
  ReviewsSection,
  RoomsSection,
} from '@/components/home/Sections';
import { api } from '@/lib/api';
import type { Block } from '@/lib/types';

interface Home {
  title: string | null;
  description: string | null;
  blocks: Block[];
}

export async function generateMetadata(): Promise<Metadata> {
  const home = await api<Home>('/store/home', { tags: ['home'] });
  return {
    title: { absolute: home.title ?? 'SSS Furniture | Teak furniture, sofas and home furnishing in Salem' },
    description: home.description ?? undefined,
    alternates: { canonical: '/' },
  };
}

export default async function HomePage() {
  const home = await api<Home>('/store/home', { tags: ['home', 'products'] });
  return (
    <>
      {home.blocks.map((b) => {
        const d = b.data as never;
        switch (b.type) {
          case 'HERO':
            return (
              <Fragment key={b.id}>
                <Hero data={d} />
                <BrandBand />
              </Fragment>
            );
          case 'ROOMS':
            return <RoomsSection key={b.id} data={d} />;
          case 'COLLECTION_STORY':
            return <CollectionStory key={b.id} data={d} />;
          case 'LOOK':
            return <LookSection key={b.id} data={d} />;
          case 'PRODUCT_RAIL':
            return <RailSection key={b.id} data={d} />;
          case 'MATERIALS':
            return <MaterialsSection key={b.id} data={d} />;
          case 'PROMISE':
            return <PromiseStrip key={b.id} data={d} />;
          case 'REVIEWS':
            return <ReviewsSection key={b.id} data={d} />;
          case 'GUIDES':
            return <GuidesSection key={b.id} data={d} />;
          case 'NEWSLETTER':
            return <NewsletterSection key={b.id} data={d} />;
          default:
            return null;
        }
      })}
    </>
  );
}
