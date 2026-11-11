'use client';

import { Box, Loader2, Move3d, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        poster?: string;
        alt?: string;
        'camera-controls'?: boolean | '';
        'touch-action'?: string;
        'auto-rotate'?: boolean | '';
        'shadow-intensity'?: string;
        'environment-image'?: string;
        exposure?: string;
        'variant-name'?: string;
        'interaction-prompt'?: string;
        loading?: string;
        reveal?: string;
        'camera-orbit'?: string;
      };
    }
  }
}

type ModelViewerElement = HTMLElement & { availableVariants?: string[]; variantName?: string | null; resetTurntableRotation?: () => void; cameraOrbit?: string };

/**
 * 3D viewer. The ~1 MB viewer library and the model file load only after the customer taps
 * "View in 3D", so the product page stays as fast as a page without 3D.
 */
export function ModelViewer({ src, poster, alt, variant, bytes }: { src: string; poster: string | null; alt: string; variant: string | null; bytes: number }) {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const ref = useRef<ModelViewerElement>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    // Hide the 3D option entirely on devices without WebGL.
    const c = document.createElement('canvas');
    if (!(c.getContext('webgl2') || c.getContext('webgl'))) setState('error');
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el && state === 'ready') el.variantName = variant && el.availableVariants?.includes(variant) ? variant : null;
  }, [variant, state]);

  const start = async () => {
    setState('loading');
    try {
      await import('@google/model-viewer');
      setState('ready');
    } catch {
      setState('error');
    }
  };

  if (state === 'error') return null;

  if (state === 'idle') {
    return (
      <button onClick={start} className="group relative grid h-full w-full place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_40%,#fff,var(--color-paper-2))]">
        {poster && <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25 blur-[2px]" />}
        <span className="relative grid justify-items-center gap-3">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-ink text-paper transition-transform duration-500 group-hover:scale-110">
            <Box className="h-7 w-7" strokeWidth={1.4} />
          </span>
          <span className="font-medium">View in 3D</span>
          <span className="text-[0.8rem] text-muted">Rotate, zoom and try every finish · {(bytes / 1_048_576).toFixed(1)} MB</span>
        </span>
      </button>
    );
  }

  return (
    <div className="relative h-full w-full bg-[radial-gradient(circle_at_50%_40%,#fff,var(--color-paper-2))]">
      {state === 'loading' && (
        <div className="absolute inset-0 z-10 grid place-items-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted" />
        </div>
      )}
      {state === 'ready' && (
        <model-viewer
          ref={ref as React.Ref<HTMLElement>}
          src={src}
          poster={poster ?? undefined}
          alt={alt}
          camera-controls=""
          touch-action="pan-y"
          {...(reduceMotion ? {} : { 'auto-rotate': '' })}
          shadow-intensity="1"
          exposure="1.05"
          interaction-prompt="auto"
          style={{ width: '100%', height: '100%', background: 'transparent', '--poster-color': 'transparent' } as React.CSSProperties}
          onLoad={() => {
            const el = ref.current;
            if (el && variant && el.availableVariants?.includes(variant)) el.variantName = variant;
          }}
        />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        <span className="flex items-center gap-2 rounded-full bg-paper/90 px-3 py-1.5 text-[0.75rem] text-ink-soft backdrop-blur">
          <Move3d className="h-3.5 w-3.5" /> Drag to rotate · pinch or scroll to zoom
        </span>
      </div>
      <button
        onClick={() => {
          const el = ref.current;
          if (el) {
            el.cameraOrbit = 'auto auto auto';
            el.resetTurntableRotation?.();
          }
        }}
        className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-paper/90 backdrop-blur"
        aria-label="Reset view"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
    </div>
  );
}
