/** What we make, from the SSS Furniture letterhead: a slow ticker under the gold "Quality · Trust · Comfort" ornament. */
const ITEMS = ['Teak furniture', 'Home furnishing', 'Luxury sofas', 'Office setup', 'Recliner sofas'];

export function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 0c.7 6.3 5.7 11.3 12 12-6.3.7-11.3 5.7-12 12-.7-6.3-5.7-11.3-12-12C6.3 11.3 11.3 6.3 12 0Z" fill="currentColor" />
    </svg>
  );
}

function Track({ hidden }: { hidden?: boolean }) {
  return (
    <ul className="marquee-track" aria-hidden={hidden || undefined}>
      {ITEMS.map((t) => (
        <li key={t} className="flex shrink-0 items-center gap-[clamp(1.5rem,3vw,3rem)]">
          <span className="font-[family-name:var(--font-display)] text-[clamp(1.6rem,3.4vw,2.8rem)] font-[380] leading-none tracking-[-0.015em] text-ink">{t}</span>
          <Sparkle className="h-[0.9rem] w-[0.9rem] text-brass" />
        </li>
      ))}
    </ul>
  );
}

export function BrandBand() {
  return (
    <section aria-label="What we make" className="border-b border-line py-12 lg:py-16">
      <div className="container-x">
        <div className="ornament reveal mx-auto max-w-2xl">
          <p className="flex items-center gap-3 text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-ink-soft sm:gap-4">
            Quality <Sparkle className="ornament-star h-3 w-3 text-brass" /> Trust <Sparkle className="ornament-star h-3 w-3 text-brass" /> Comfort
          </p>
        </div>
      </div>
      <div className="marquee mt-9 lg:mt-11">
        <Track />
        <Track hidden />
      </div>
    </section>
  );
}
