'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ComponentProps, type MouseEvent, useEffect } from 'react';

/**
 * Reveals elements marked .reveal as they scroll into view. Content is visible without
 * JavaScript and for reduced-motion users (see globals.css).
 */
export function RevealObserver() {
  const pathname = usePathname();
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    const scan = () => document.querySelectorAll('.reveal:not(.is-visible)').forEach((el) => io.observe(el));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [pathname]);

  // Resolve any pending page transition once the new route has rendered.
  useEffect(() => {
    pendingTransition?.();
    pendingTransition = null;
  }, [pathname]);
  return null;
}

let pendingTransition: (() => void) | null = null;

/**
 * A link that morphs the clicked product image into the product page hero using the
 * View Transitions API. Falls back to normal navigation where unsupported or with reduced motion.
 */
export function TransitionLink({ href, onClick, ...rest }: ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const doc = document as Document & { startViewTransition?: (cb: () => Promise<void>) => unknown };
    if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    e.preventDefault();
    const img = e.currentTarget.querySelector<HTMLElement>('[data-vt-image]');
    if (img) img.style.viewTransitionName = 'product-hero';
    doc.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          pendingTransition = () => {
            if (img) img.style.viewTransitionName = '';
            resolve();
          };
          router.push(href);
          setTimeout(() => {
            pendingTransition?.();
            pendingTransition = null;
          }, 1500);
        }),
    );
  };
  return <Link href={href} onClick={handle} {...rest} />;
}
