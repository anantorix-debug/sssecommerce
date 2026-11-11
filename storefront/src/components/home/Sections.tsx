import { ArrowRight, ArrowUpRight, CalendarDays, RotateCcw, ShieldCheck, Wrench } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { Guide, Img as ImgData, Look, ProductCard as Card, Room } from '@/lib/types';
import { NewsletterForm } from '../layout/NewsletterForm';
import { ProductRail } from '../product/ProductRail';
import { LookScene } from '../product/LookScene';
import { ButtonLink } from '../ui/Button';
import { Img } from '../ui/Img';
import { SectionHeader, Stars } from '../ui/misc';

export function RoomsSection({ data }: { data: { eyebrow?: string; title: string; subtitle?: string; rooms: Room[] } }) {
  return (
    <section id="after-hero" className="container-x py-20 lg:py-28">
      <SectionHeader eyebrow={data.eyebrow} title={data.title} subtitle={data.subtitle} className="reveal" action={<Link href="/rooms" className="link-underline text-[0.92rem] font-medium">All rooms</Link>} />
      <div className="no-scrollbar -mx-[clamp(1rem,4vw,3rem)] mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-[clamp(1rem,4vw,3rem)] md:mx-0 md:grid md:grid-cols-4 md:gap-6 md:overflow-visible md:px-0">
        {data.rooms.map((r, i) => (
          <Link
            key={r.slug}
            href={`/rooms/${r.slug}`}
            className={`reveal group relative block w-[72vw] shrink-0 snap-start sm:w-[44vw] md:w-auto ${i % 2 === 1 ? 'md:mt-16' : ''}`}
            style={{ '--reveal-delay': `${i * 90}ms` } as React.CSSProperties}
          >
            <div className="relative aspect-[3/4] overflow-hidden bg-paper-2">
              {r.image && (
                <Image src={r.image} alt={`${r.name} styled with our furniture`} fill sizes="(min-width: 768px) 24vw, 72vw" className="object-cover transition-transform duration-[1.2s] ease-[var(--ease-out-soft)] group-hover:scale-[1.05]" />
              )}
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgb(10_9_8/0.55))]" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5 text-white">
                <div>
                  <p className="display-sm text-[1.5rem]">{r.name}</p>
                  {r.tagline && <p className="mt-1 text-[0.85rem] text-white/80">{r.tagline}</p>}
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-full border border-white/40 transition-colors group-hover:bg-white group-hover:text-ink">
                  <ArrowUpRight className="h-4 w-4" strokeWidth={1.6} />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function CollectionStory({ data }: { data: { eyebrow?: string; title: string; body: string; image: ImgData | null; secondaryImage: ImgData | null; collection: { name: string; slug: string } | null } }) {
  return (
    <section className="overflow-hidden bg-paper-2 py-20 lg:py-32">
      <div className="container-x grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
        <div className="relative lg:col-span-7">
          <div className="reveal relative aspect-[5/4] overflow-hidden">
            <div className="parallax-img absolute inset-0">
              <Img image={data.image} sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover" />
            </div>
          </div>
          {data.secondaryImage && (
            <div className="reveal absolute -bottom-10 right-4 hidden aspect-square w-[38%] overflow-hidden border-[10px] border-paper-2 md:block lg:-right-12" style={{ '--reveal-delay': '200ms' } as React.CSSProperties}>
              <Img image={data.secondaryImage} sizes="22vw" className="object-cover" />
            </div>
          )}
        </div>
        <div className="reveal grid gap-6 lg:col-span-4 lg:col-start-9">
          {data.eyebrow && <p className="eyebrow">{data.eyebrow}</p>}
          <h2 className="display-lg">{data.title}</h2>
          <p className="text-[1.05rem] leading-relaxed text-ink-soft">{data.body}</p>
          {data.collection && (
            <ButtonLink href={`/collections/${data.collection.slug}`} variant="secondary" className="justify-self-start">
              Explore {data.collection.name}
            </ButtonLink>
          )}
        </div>
      </div>
    </section>
  );
}

export function LookSection({ data }: { data: { eyebrow?: string; title: string; subtitle?: string; look: Look } }) {
  return (
    <section className="container-x py-20 lg:py-28">
      <SectionHeader eyebrow={data.eyebrow} title={data.title} subtitle={data.subtitle} className="reveal" />
      <div className="reveal mt-10">
        <LookScene look={data.look} hideHeading />
      </div>
    </section>
  );
}

export function RailSection({ data }: { data: { eyebrow?: string; title: string; href?: string; products: Card[] } }) {
  return (
    <section className="py-20 lg:py-24">
      <div className="container-x">
        <SectionHeader eyebrow={data.eyebrow} title={data.title} className="reveal" action={data.href ? <Link href={data.href} className="link-underline text-[0.92rem] font-medium">Shop all</Link> : undefined} />
      </div>
      <ProductRail products={data.products} className="mt-10" />
    </section>
  );
}

export function MaterialsSection({ data }: { data: { eyebrow?: string; title: string; items: { title: string; body: string; image: ImgData | null }[] } }) {
  return (
    <section className="container-x py-20 lg:py-28">
      <SectionHeader eyebrow={data.eyebrow} title={data.title} className="reveal" />
      <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-6">
        {data.items.map((item, i) => (
          <article key={item.title} className="reveal grid content-start gap-5" style={{ '--reveal-delay': `${i * 110}ms` } as React.CSSProperties}>
            <div className="relative aspect-[4/5] overflow-hidden bg-paper-2">
              <Img image={item.image} sizes="(min-width: 768px) 30vw, 100vw" className="object-cover" />
            </div>
            <div className="grid gap-2 pr-6">
              <h3 className="display-sm">{item.title}</h3>
              <p className="text-ink-soft">{item.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

const ICONS = { calendar: CalendarDays, wrench: Wrench, rotate: RotateCcw, shield: ShieldCheck };

export function PromiseStrip({ data }: { data: { items: { title: string; body: string; icon: keyof typeof ICONS }[] } }) {
  return (
    <section className="border-y border-line bg-surface">
      <div className="container-x grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        {data.items.map((item) => {
          const Icon = ICONS[item.icon] ?? ShieldCheck;
          return (
            <div key={item.title} className="flex gap-4 py-7 sm:px-2 lg:px-8 lg:first:pl-0">
              <Icon className="mt-0.5 h-6 w-6 shrink-0 text-accent" strokeWidth={1.4} />
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="mt-1 text-[0.88rem] leading-relaxed text-ink-soft">{item.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ReviewsSection({ data }: { data: { eyebrow?: string; title: string; reviews: { id: string; rating: number; title: string; body: string; author: string; product: { name: string; slug: string } }[] } }) {
  if (!data.reviews.length) return null;
  return (
    <section className="py-20 lg:py-28">
      <div className="container-x">
        <SectionHeader eyebrow={data.eyebrow} title={data.title} className="reveal" />
      </div>
      <div className="no-scrollbar mt-10 flex snap-x gap-5 overflow-x-auto px-[clamp(1rem,4vw,3rem)] pb-2">
        {data.reviews.map((r) => (
          <figure key={r.id} className="reveal grid w-[82vw] shrink-0 snap-start content-between gap-6 border border-line bg-surface p-7 sm:w-[420px]">
            <div className="grid gap-4">
              <Stars value={r.rating} size={15} />
              <blockquote className="grid gap-2">
                <p className="display-sm">“{r.title}”</p>
                <p className="text-ink-soft">{r.body}</p>
              </blockquote>
            </div>
            <figcaption className="flex items-center justify-between gap-4 border-t border-line pt-4 text-[0.85rem]">
              <span className="font-medium">{r.author}</span>
              <Link href={`/products/${r.product.slug}`} className="link-underline truncate text-muted hover:text-ink">
                {r.product.name}
              </Link>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export function GuidesSection({ data }: { data: { eyebrow?: string; title: string; guides: Guide[] } }) {
  return (
    <section className="container-x py-20 lg:py-24">
      <SectionHeader eyebrow={data.eyebrow} title={data.title} className="reveal" action={<Link href="/guides" className="link-underline text-[0.92rem] font-medium">All guides</Link>} />
      <div className="mt-10 grid gap-8 md:grid-cols-3">
        {data.guides.map((g, i) => <GuideCard key={g.slug} guide={g} delay={i * 100} />)}
      </div>
    </section>
  );
}

export function GuideCard({ guide: g, delay = 0 }: { guide: Guide; delay?: number }) {
  return (
    <Link href={`/guides/${g.slug}`} className="reveal group grid content-start gap-4" style={{ '--reveal-delay': `${delay}ms` } as React.CSSProperties}>
      <div className="relative aspect-[16/10] overflow-hidden bg-paper-2">
        <Img image={g.cover} sizes="(min-width: 768px) 30vw, 100vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
      </div>
      <div className="grid gap-2">
        <p className="text-[0.78rem] text-muted">{g.readMinutes} min read</p>
        <h3 className="display-sm group-hover:text-accent">{g.title}</h3>
        {g.excerpt && <p className="text-[0.92rem] text-ink-soft">{g.excerpt}</p>}
        <span className="mt-1 flex items-center gap-1.5 text-[0.88rem] font-medium">
          Read the guide <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" strokeWidth={1.6} />
        </span>
      </div>
    </Link>
  );
}

export function NewsletterSection({ data }: { data: { title: string; body: string } }) {
  return (
    <section className="container-x pt-8">
      <div className="reveal grid items-center gap-8 border-t border-line pt-16 lg:grid-cols-2">
        <div className="grid gap-3">
          <h2 className="display-lg">{data.title}</h2>
          <p className="max-w-md text-ink-soft">{data.body}</p>
        </div>
        <div className="lg:justify-self-end lg:w-[440px]">
          <NewsletterForm />
        </div>
      </div>
    </section>
  );
}
