'use client';

import clsx from 'clsx';
import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: 'right' | 'left' | 'bottom';
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  hideTitle?: boolean;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

/**
 * Side or bottom sheet used for the mini cart, filters, mobile menu and quick views.
 * Traps focus, closes on Escape and backdrop click, returns focus to the trigger, locks page scroll.
 */
export function Sheet({ open, onClose, title, side = 'right', children, footer, width = 'min(440px, 100vw)', hideTitle }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panel.current) {
        const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const position =
    side === 'bottom'
      ? 'inset-x-0 bottom-0 max-h-[88svh] rounded-t-2xl animate-[sheet-in-bottom_.38s_var(--ease-out-soft)]'
      : side === 'left'
        ? 'inset-y-0 left-0 animate-[sheet-in-right_.38s_var(--ease-out-soft)_reverse]'
        : 'inset-y-0 right-0 animate-[sheet-in-right_.38s_var(--ease-out-soft)]';

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="presentation">
      <div className="absolute inset-0 bg-ink/35 animate-[fade-in_.3s_ease-out]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx('absolute flex flex-col bg-paper shadow-[0_0_60px_rgb(0_0_0/0.18)]', position)}
        style={side === 'bottom' ? undefined : { width }}
      >
        <div className={clsx('flex items-center justify-between gap-4 border-b border-line px-5 py-4', hideTitle && 'sr-only')}>
          <h2 className="display-sm">{title}</h2>
          <button onClick={onClose} className="-mr-2 grid h-10 w-10 place-items-center rounded-full hover:bg-ink/[0.06]" aria-label="Close">
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="border-t border-line bg-paper px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
