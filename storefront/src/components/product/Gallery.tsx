'use client';

import clsx from 'clsx';
import { Box, ChevronLeft, ChevronRight, Expand, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ProductDetail } from '@/lib/types';
import { ModelViewer } from './ModelViewer';

type Media = ProductDetail['media'][number];

export function Gallery({ name, images, model, variantName }: { name: string; images: Media[]; model: ProductDetail['model3d']; variantName: string | null }) {
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const slides = images.length + (model ? 1 : 0);
  const showingModel = model !== null && index === images.length;
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => setIndex(0), [images]);

  const go = useCallback((i: number) => setIndex((i + slides) % slides), [slides]);

  // Mobile: swipe through a scroll-snapped track
  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(i);
  };
  useEffect(() => {
    const el = track.current;
    if (el && window.innerWidth < 1024) el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' });
  }, [index]);

  const current = images[index];

  return (
    <div className="grid gap-3 lg:grid-cols-[88px_1fr] lg:gap-4">
      {/* Thumbnails (desktop) */}
      <div className="order-2 hidden max-h-[calc(100svh-9rem)] flex-col gap-3 overflow-y-auto no-scrollbar lg:order-1 lg:flex">
        {images.map((m, i) => (
          <button key={m.id + i} onClick={() => setIndex(i)} aria-label={`Show image ${i + 1}`} aria-current={i === index} className={clsx('relative aspect-[4/5] w-full shrink-0 overflow-hidden bg-paper-2 transition-opacity', i === index ? 'ring-1 ring-ink ring-offset-2 ring-offset-paper' : 'opacity-70 hover:opacity-100')}>
            <Image src={m.url} alt="" fill sizes="88px" className="object-cover" />
          </button>
        ))}
        {model && (
          <button onClick={() => setIndex(images.length)} aria-label="View in 3D" className={clsx('grid aspect-[4/5] w-full shrink-0 place-items-center bg-paper-2 text-[0.7rem] font-semibold', showingModel && 'ring-1 ring-ink ring-offset-2 ring-offset-paper')}>
            <span className="grid justify-items-center gap-1">
              <Box className="h-5 w-5" strokeWidth={1.5} /> 3D
            </span>
          </button>
        )}
      </div>

      <div className="relative order-1 lg:order-2">
        {/* Desktop main stage */}
        <div className="relative hidden aspect-[4/5] overflow-hidden bg-paper-2 lg:block">
          {showingModel ? (
            <ModelViewer src={model!.url} poster={model!.poster} alt={`${name}, 3D model`} variant={variantName} bytes={model!.bytes} />
          ) : (
            current && (
              <div
                className="absolute inset-0 cursor-zoom-in"
                style={{ viewTransitionName: index === 0 ? 'product-hero' : undefined }}
                onMouseMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
                }}
                onMouseLeave={() => setZoom(null)}
                onClick={() => setLightbox(true)}
              >
                <Image
                  src={current.url}
                  alt={current.alt || name}
                  fill
                  priority={index === 0}
                  fetchPriority={index === 0 ? 'high' : undefined}
                  sizes="(min-width: 1024px) 55vw, 100vw"
                  quality={85}
                  placeholder={current.placeholder ? 'blur' : 'empty'}
                  blurDataURL={current.placeholder ?? undefined}
                  className="object-cover transition-transform duration-300 ease-out"
                  style={zoom ? { transform: 'scale(1.8)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
                />
              </div>
            )
          )}
          {!showingModel && (
            <button onClick={() => setLightbox(true)} className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-paper/90 backdrop-blur" aria-label="Open full screen gallery">
              <Expand className="h-4 w-4" strokeWidth={1.6} />
            </button>
          )}
          {slides > 1 && (
            <div className="absolute bottom-4 right-4 flex gap-2">
              <button onClick={() => go(index - 1)} className="grid h-10 w-10 place-items-center rounded-full bg-paper/90 backdrop-blur" aria-label="Previous image">
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </button>
              <button onClick={() => go(index + 1)} className="grid h-10 w-10 place-items-center rounded-full bg-paper/90 backdrop-blur" aria-label="Next image">
                <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>

        {/* Mobile swipe track */}
        <div ref={track} onScroll={onScroll} className="no-scrollbar -mx-[clamp(1rem,4vw,3rem)] flex snap-x snap-mandatory overflow-x-auto lg:hidden">
          {images.map((m, i) => (
            <div key={m.id + i} className="relative aspect-[4/5] w-full shrink-0 snap-center bg-paper-2" style={{ viewTransitionName: i === 0 ? 'product-hero' : undefined }}>
              <Image src={m.url} alt={m.alt || name} fill priority={i === 0} sizes="100vw" placeholder={m.placeholder ? 'blur' : 'empty'} blurDataURL={m.placeholder ?? undefined} className="object-cover" onClick={() => setLightbox(true)} />
            </div>
          ))}
          {model && (
            <div className="relative aspect-[4/5] w-full shrink-0 snap-center">
              <ModelViewer src={model.url} poster={model.poster} alt={`${name}, 3D model`} variant={variantName} bytes={model.bytes} />
            </div>
          )}
        </div>
        {slides > 1 && (
          <div className="mt-3 flex justify-center gap-1.5 lg:hidden" aria-hidden>
            {Array.from({ length: slides }, (_, i) => (
              <span key={i} className={clsx('h-1.5 rounded-full transition-all', i === index ? 'w-5 bg-ink' : 'w-1.5 bg-line-strong')} />
            ))}
          </div>
        )}
      </div>

      {lightbox && current && <Lightbox images={images} start={Math.min(index, images.length - 1)} name={name} onClose={() => setLightbox(false)} />}
    </div>
  );
}

function Lightbox({ images, start, name, onClose }: { images: Media[]; start: number; name: string; onClose: () => void }) {
  const [i, setI] = useState(start);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((x) => (x + 1) % images.length);
      if (e.key === 'ArrowLeft') setI((x) => (x - 1 + images.length) % images.length);
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', key);
    };
  }, [images.length, onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-paper animate-[fade-in_.25s_ease-out]" role="dialog" aria-modal="true" aria-label={`${name} images`}>
      <div className="absolute inset-0 p-4 pb-20 sm:p-10 sm:pb-24">
        <div className="relative h-full w-full">
          <Image src={images[i].url} alt={images[i].alt || name} fill sizes="100vw" quality={85} className="object-contain" />
        </div>
      </div>
      <button onClick={onClose} autoFocus className="absolute right-4 top-4 grid h-12 w-12 place-items-center rounded-full bg-ink text-paper" aria-label="Close gallery">
        <X className="h-5 w-5" />
      </button>
      <div className="absolute inset-x-0 bottom-5 flex items-center justify-center gap-4">
        <button onClick={() => setI((i - 1 + images.length) % images.length)} className="grid h-11 w-11 place-items-center rounded-full border border-line-strong" aria-label="Previous image">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-[0.85rem] tabular text-muted">
          {i + 1} / {images.length}
        </span>
        <button onClick={() => setI((i + 1) % images.length)} className="grid h-11 w-11 place-items-center rounded-full border border-line-strong" aria-label="Next image">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
