import clsx from 'clsx';
import { Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { discountPercent, inr } from '@/lib/format';

export function Price({ price, mrp, size = 'md', className }: { price: number; mrp?: number | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const off = discountPercent(price, mrp ?? null);
  return (
    <div className={clsx('flex flex-wrap items-baseline gap-x-2 tabular', className)}>
      <span className={clsx('font-medium text-ink', size === 'lg' ? 'text-[1.6rem] tracking-[-0.01em]' : size === 'sm' ? 'text-[0.9rem]' : 'text-[1rem]')}>{inr(price)}</span>
      {off > 0 && mrp && (
        <>
          <span className={clsx('text-muted line-through', size === 'lg' ? 'text-base' : 'text-[0.82rem]')}>
            <span className="sr-only">Was </span>
            {inr(mrp)}
          </span>
          <span className={clsx('font-medium text-clay', size === 'lg' ? 'text-sm' : 'text-[0.78rem]')}>{off}% off</span>
        </>
      )}
    </div>
  );
}

export function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-[2px] text-brass', className)} aria-label={`Rated ${value.toFixed(1)} out of 5`} role="img">
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star className="absolute inset-0 text-line-strong" width={size} height={size} strokeWidth={1.5} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="fill-current" width={size} height={size} strokeWidth={1.5} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'clay' | 'dark' | 'success' | 'warning' | 'danger'; className?: string }) {
  const tones = {
    neutral: 'bg-paper text-ink-soft',
    accent: 'bg-accent text-white',
    clay: 'bg-clay text-white',
    dark: 'bg-ink text-paper',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    danger: 'bg-danger/10 text-danger',
  };
  return <span className={clsx('inline-flex items-center rounded-full px-2.5 py-[3px] text-[0.7rem] font-semibold tracking-[0.04em]', tones[tone], className)}>{children}</span>;
}

export function Breadcrumbs({ items, className }: { items: { label: string; href?: string }[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={clsx('text-[0.8rem] text-muted', className)}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <li>
          <Link href="/" className="hover:text-ink">
            Home
          </Link>
        </li>
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2">
            <span aria-hidden className="text-line-strong">/</span>
            {item.href && i < items.length - 1 ? (
              <Link href={item.href} className="hover:text-ink">
                {item.label}
              </Link>
            ) : (
              <span aria-current={i === items.length - 1 ? 'page' : undefined} className="text-ink-soft">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function SectionHeader({ eyebrow, title, subtitle, action, className, align = 'left' }: { eyebrow?: string; title: string; subtitle?: string | null; action?: ReactNode; className?: string; align?: 'left' | 'center' }) {
  return (
    <div className={clsx('flex flex-wrap items-end justify-between gap-x-10 gap-y-4', align === 'center' && 'flex-col items-center text-center', className)}>
      <div className={clsx('grid max-w-2xl gap-3', align === 'center' && 'justify-items-center')}>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="display-lg">{title}</h2>
        {subtitle && <p className="max-w-xl text-[1.02rem] leading-relaxed text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx('skeleton rounded-sm', className)} />;
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-md justify-items-center gap-4 py-16 text-center">
      {icon && <div className="grid h-14 w-14 place-items-center rounded-full bg-paper-2 text-ink-soft">{icon}</div>}
      <h2 className="display-md">{title}</h2>
      {body && <p className="text-ink-soft">{body}</p>}
      {action}
    </div>
  );
}

/** The SSS Furniture lockup (cut from the brand letterhead): maroon for light backgrounds, white for dark. */
export function Logo({ tone = 'colour', alt = 'SSS Furniture', priority, className }: { tone?: 'colour' | 'white'; alt?: string; priority?: boolean; className?: string }) {
  return (
    <Image
      src={tone === 'white' ? '/brand/sss-furniture-white.png' : '/brand/sss-furniture.png'}
      alt={alt}
      width={600}
      height={195}
      priority={priority}
      sizes="240px"
      className={clsx('w-auto select-none', className)}
      draggable={false}
    />
  );
}
