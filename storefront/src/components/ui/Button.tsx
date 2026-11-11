import clsx from 'clsx';
import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'light' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const base =
  'relative isolate inline-flex items-center justify-center gap-2 overflow-hidden rounded-full font-medium tracking-[0.01em] transition-[background-color,color,border-color,transform,box-shadow] duration-300 ease-[var(--ease-out-soft)] disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98] select-none whitespace-nowrap';

const variants: Record<Variant, string> = {
  primary: 'btn-sheen bg-ink text-paper hover:bg-accent focus-visible:bg-accent',
  secondary: 'border border-ink/80 text-ink hover:bg-ink hover:text-paper',
  ghost: 'text-ink hover:bg-ink/[0.06]',
  light: 'bg-paper text-ink hover:bg-white shadow-[0_1px_0_rgb(0_0_0/0.04)]',
  danger: 'border border-danger/40 text-danger hover:bg-danger hover:text-white',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-[0.82rem]',
  md: 'h-11 px-6 text-[0.9rem]',
  lg: 'h-[3.25rem] px-8 text-[0.95rem]',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return clsx(base, variants[variant], sizes[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = 'primary', size = 'md', className, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx('h-4 w-4 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
