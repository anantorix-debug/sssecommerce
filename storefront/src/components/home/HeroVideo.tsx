'use client';

import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * The hero film loads only after the page is ready, never for reduced-motion or data-saver
 * visitors, and the poster image remains the LCP element. Visitors can pause it.
 */
export function HeroVideo({ src, type, poster }: { src: string; type: string; poster?: string }) {
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(true);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (reduce || saveData) return;
    const start = () => setEnabled(true);
    if (document.readyState === 'complete') setTimeout(start, 600);
    else window.addEventListener('load', () => setTimeout(start, 600), { once: true });
  }, []);

  if (!enabled) return null;
  return (
    <>
      <video
        ref={ref}
        className="absolute inset-0 h-full w-full object-cover animate-[fade-in_1.2s_ease-out]"
        autoPlay
        muted
        loop
        playsInline
        preload="none"
        poster={poster}
        aria-hidden
      >
        <source src={src} type={type} />
      </video>
      <button
        onClick={() => {
          if (!ref.current) return;
          if (playing) ref.current.pause();
          else void ref.current.play();
          setPlaying(!playing);
        }}
        className="absolute bottom-5 right-5 z-10 grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-black/20 text-white backdrop-blur"
        aria-label={playing ? 'Pause background video' : 'Play background video'}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
    </>
  );
}
