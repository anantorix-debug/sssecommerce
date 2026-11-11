import { ArrowDown, CalendarCheck } from 'lucide-react';
import { type CSSProperties, Fragment } from 'react';
import type { Img as ImgData } from '@/lib/types';
import { ButtonLink } from '../ui/Button';
import { Img } from '../ui/Img';
import { HeroVideo } from './HeroVideo';

interface HeroData {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  image: ImgData | null;
  video?: { url: string; type: string } | null;
  ctaPrimary?: { label: string; href: string };
  ctaSecondary?: { label: string; href: string };
}

const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

export function Hero({ data }: { data: HeroData }) {
  const words = data.title.split(/\s+/).filter(Boolean);
  // The rest of the hero follows once the last headline word is on its way.
  const after = 250 + words.length * 70 + 150;
  return (
    <section className="relative isolate flex min-h-[72svh] items-end overflow-hidden bg-ink text-white lg:min-h-[calc(100svh-2.25rem)]" aria-label="Introduction">
      <div className="absolute inset-0 -z-10">
        <div className="parallax-img absolute inset-0">
          <div className="hero-settle absolute inset-0">
            <Img image={data.image} priority fetchPriority="high" sizes="100vw" quality={85} className="object-cover" />
          </div>
        </div>
        {data.video && <HeroVideo src={data.video.url} type={data.video.type} poster={data.image?.url} />}
        {/* Scrim keeps text readable on any photograph without a glass layer behind type */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(10_9_8/0.4)_0%,rgb(10_9_8/0)_26%,rgb(10_9_8/0.12)_48%,rgb(10_9_8/0.72)_100%)]" />
        <div className="absolute inset-0 hidden bg-[linear-gradient(90deg,rgb(10_9_8/0.5)_0%,rgb(10_9_8/0.28)_38%,rgb(10_9_8/0)_62%)] lg:block" />
      </div>

      <div className="container-x relative grid w-full gap-10 pb-12 pt-24 lg:grid-cols-12 lg:items-end lg:pb-16 lg:pt-44">
        <div className="grid max-w-3xl gap-6 lg:col-span-8">
          {data.eyebrow && (
            <p className="hero-rise text-[0.74rem] font-semibold uppercase tracking-[0.2em] text-white/80" style={delay(150)}>
              {data.eyebrow}
            </p>
          )}
          <h1 className="display-xl">
            {words.map((w, i) => (
              <Fragment key={i}>
                {i > 0 && ' '}
                <span className="word-mask">
                  <span style={delay(250 + i * 70)}>{w}</span>
                </span>
              </Fragment>
            ))}
          </h1>
          {data.subtitle && (
            <p className="hero-rise max-w-xl text-[1.08rem] leading-relaxed text-white/85" style={delay(after)}>
              {data.subtitle}
            </p>
          )}
          <div className="hero-rise mt-2 flex flex-wrap gap-3" style={delay(after + 120)}>
            {data.ctaPrimary && (
              <ButtonLink href={data.ctaPrimary.href} variant="light" size="lg">
                {data.ctaPrimary.label}
              </ButtonLink>
            )}
            {data.ctaSecondary && (
              <ButtonLink href={data.ctaSecondary.href} size="lg" className="border border-white/50 bg-transparent text-white hover:bg-white hover:text-ink">
                {data.ctaSecondary.label}
              </ButtonLink>
            )}
          </div>
        </div>
        <div className="hero-rise hidden justify-self-end lg:col-span-4 lg:block" style={delay(after + 260)}>
          <div className="flex max-w-xs items-start gap-4 rounded-xl border border-white/20 bg-white/10 p-5 text-[0.88rem] leading-relaxed text-white/90 backdrop-blur-xl">
            <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.5} />
            <p>
              <span className="font-semibold text-white">Delivered on your date.</span> Choose a slot once your order is confirmed. Our team installs it and takes the packaging away.
            </p>
          </div>
        </div>
      </div>
      <a href="#after-hero" className="absolute bottom-5 left-1/2 hidden -translate-x-1/2 items-center gap-2 text-[0.72rem] uppercase tracking-[0.2em] text-white/70 hover:text-white md:flex" aria-label="Scroll to content">
        <ArrowDown className="h-4 w-4 animate-bounce" strokeWidth={1.5} />
      </a>
    </section>
  );
}
