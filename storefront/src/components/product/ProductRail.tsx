'use client';

import clsx from 'clsx';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import type { ProductCard as Card } from '@/lib/types';
import { ProductCard } from './ProductCard';

export function ProductRail({ products, className }: { products: Card[]; className?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () => setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const scroll = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: 'smooth' });

  return (
    <div className={clsx('relative', className)}>
      <div ref={track} className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-px-[clamp(1rem,4vw,3rem)] px-[clamp(1rem,4vw,3rem)] pb-2 lg:gap-6">
        {products.map((p, i) => (
          <ProductCard key={p.id} product={p} className="reveal w-[68vw] shrink-0 snap-start sm:w-[40vw] lg:w-[calc((min(100vw,90rem)-6rem-4.5rem)/4)]" style={{ '--reveal-delay': `${Math.min(i, 4) * 80}ms` } as CSSProperties} sizes="(min-width: 1024px) 24vw, (min-width: 640px) 40vw, 68vw" priority={i < 2 && false} />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-[38%] hidden justify-between px-6 lg:flex">
        <RailButton onClick={() => scroll(-1)} hidden={edges.start} label="Previous products">
          <ArrowLeft className="h-5 w-5" strokeWidth={1.5} />
        </RailButton>
        <RailButton onClick={() => scroll(1)} hidden={edges.end} label="Next products">
          <ArrowRight className="h-5 w-5" strokeWidth={1.5} />
        </RailButton>
      </div>
    </div>
  );
}

function RailButton({ onClick, hidden, label, children }: { onClick: () => void; hidden: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      tabIndex={hidden ? -1 : 0}
      className={clsx('pointer-events-auto grid h-12 w-12 place-items-center rounded-full bg-paper/95 shadow-[0_8px_24px_rgb(0_0_0/0.12)] backdrop-blur transition-opacity duration-300 hover:bg-white', hidden && 'pointer-events-none opacity-0')}
    >
      {children}
    </button>
  );
}
