'use client';

import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';

// ── Buttons ──
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
const variants: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-accent',
  accent: 'bg-accent text-white hover:bg-ink',
  secondary: 'border border-line-strong bg-surface hover:border-ink',
  ghost: 'hover:bg-ink/[0.06]',
  danger: 'border border-danger/30 text-danger hover:bg-danger hover:text-white',
};
export const btn = (v: Variant = 'secondary', size: 'sm' | 'md' = 'md', cls?: string) =>
  clsx('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-45', size === 'sm' ? 'h-8 px-3 text-[0.8rem]' : 'h-10 px-4 text-[0.86rem]', variants[v], cls);

export function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button className={btn(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = 'secondary', size = 'md', className, children }: { href: string; variant?: Variant; size?: 'sm' | 'md'; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={btn(variant, size, className)}>
      {children}
    </Link>
  );
}

// ── Form fields ──
const control = 'w-full rounded-lg border border-line-strong bg-surface px-3 text-[0.88rem] focus:border-ink focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:bg-canvas disabled:text-muted aria-[invalid=true]:border-danger';

function Wrap({ id, label, hint, error, className, children }: { id: string; label?: string; hint?: ReactNode; error?: string; className?: string; children: ReactNode }) {
  return (
    <div className={clsx('grid content-start gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-[0.78rem] font-medium text-ink-soft">
          {label}
        </label>
      )}
      {children}
      {error ? <p className="text-[0.76rem] text-danger">{error}</p> : hint ? <p className="text-[0.76rem] text-muted">{hint}</p> : null}
    </div>
  );
}

type FieldProps = { label?: string; hint?: ReactNode; error?: string; className?: string };

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(function Input({ label, hint, error, className, id, ...rest }, ref) {
  const auto = useId();
  return (
    <Wrap id={id ?? auto} label={label} hint={hint} error={error} className={className}>
      <input ref={ref} id={id ?? auto} className={clsx(control, 'h-10')} aria-invalid={error ? true : undefined} {...rest} />
    </Wrap>
  );
});

export function Textarea({ label, hint, error, className, id, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps) {
  const auto = useId();
  return (
    <Wrap id={id ?? auto} label={label} hint={hint} error={error} className={className}>
      <textarea id={id ?? auto} className={clsx(control, 'min-h-24 py-2.5 leading-relaxed')} aria-invalid={error ? true : undefined} {...rest} />
    </Wrap>
  );
}

export function Select({ label, hint, error, className, id, options, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & FieldProps & { options: { value: string; label: string }[] }) {
  const auto = useId();
  return (
    <Wrap id={id ?? auto} label={label} hint={hint} error={error} className={className}>
      <select id={id ?? auto} className={clsx(control, 'h-10 pr-8')} aria-invalid={error ? true : undefined} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrap>
  );
}

/** Rupee input that reads and writes paise. */
export function MoneyInput({ value, onChange, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & FieldProps & { value: number | null; onChange: (paise: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value / 100));
  useEffect(() => setText(value === null ? '' : String(value / 100)), [value]);
  return (
    <Input
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.]/g, '');
        setText(t);
        onChange(t === '' ? null : Math.round(Number(t) * 100));
      }}
      {...rest}
    />
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={clsx('flex items-start gap-3', disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line-strong')}
      >
        <span className={clsx('absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </button>
      <span className="grid">
        <span className="text-[0.86rem]">{label}</span>
        {hint && <span className="text-[0.76rem] text-muted">{hint}</span>}
      </span>
    </label>
  );
}

// ── Layout pieces ──
export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-6 grid gap-2">
      {back && (
        <Link href={back.href} className="flex items-center gap-1 text-[0.8rem] text-muted hover:text-ink">
          <ChevronLeft className="h-3.5 w-3.5" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="font-[family-name:var(--font-display)] text-[1.75rem] leading-tight tracking-[-0.01em]">{title}</h1>
          {description && <p className="text-[0.86rem] text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Card({ title, actions, children, className, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={clsx('card', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          {title && <h2 className="text-[0.92rem] font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-ink/[0.06] text-ink-soft',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    danger: 'bg-danger/10 text-danger',
    info: 'bg-info/10 text-info',
    accent: 'bg-accent-soft text-accent',
  };
  return <span className={clsx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[0.72rem] font-semibold', tones[tone])}>{children}</span>;
}

const STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent'> = {
  ACTIVE: 'success', DRAFT: 'neutral', ARCHIVED: 'danger',
  PENDING_PAYMENT: 'warning', PENDING_CONFIRMATION: 'warning', CONFIRMED: 'info', PROCESSING: 'accent', SHIPPED: 'accent', DELIVERED: 'success', CANCELLED: 'danger', EXPIRED: 'neutral',
  REQUESTED: 'warning', APPROVED: 'info', REJECTED: 'danger', PICKUP_SCHEDULED: 'accent', RECEIVED: 'accent', INSPECTED: 'info', REFUNDED: 'success', CLOSED: 'neutral',
  PROCESSED: 'success', FAILED: 'danger', PENDING: 'warning', CAPTURED: 'success', CREATED: 'warning', PENDING_COLLECTION: 'warning', COLLECTED: 'success', PARTIALLY_REFUNDED: 'info',
  SCHEDULED: 'info', COMPLETED: 'success',
};
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{label ?? status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 px-6 py-14 text-center">
      <p className="font-semibold">{title}</p>
      {body && <p className="max-w-sm text-[0.86rem] text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Loading({ rows = 6 }: { rows?: number }) {
  return (
    <div className="grid gap-2 p-5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-9" />
      ))}
    </div>
  );
}

export function ErrorBox({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-danger/25 bg-danger/[0.05] px-4 py-3 text-[0.86rem] text-danger">
      {message}
    </div>
  );
}

export function Pager({ page, pageCount, onPage, total }: { page: number; pageCount: number; onPage: (p: number) => void; total?: number }) {
  if (pageCount <= 1) return total !== undefined ? <p className="px-5 py-3 text-[0.78rem] text-muted">{total} total</p> : null;
  return (
    <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[0.8rem] text-muted">
      <span>
        Page {page} of {pageCount}
        {total !== undefined && ` · ${total} total`}
      </span>
      <div className="flex gap-1">
        <button className={btn('ghost', 'sm')} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button className={btn('ghost', 'sm')} disabled={page >= pageCount} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** Data table with a sticky header. Columns render cells; rows can be links. */
export function Table<T>({ rows, columns, rowHref, empty, onRowClick }: {
  rows: T[];
  columns: { key: string; label: ReactNode; className?: string; render: (r: T) => ReactNode }[];
  rowHref?: (r: T) => string;
  onRowClick?: (r: T) => void;
  empty?: ReactNode;
}) {
  if (!rows.length) return <>{empty ?? <Empty title="Nothing here yet" />}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-[0.85rem]">
        <thead>
          <tr className="border-b border-line bg-canvas/60 text-[0.72rem] uppercase tracking-[0.06em] text-muted">
            {columns.map((c) => (
              <th key={c.key} className={clsx('whitespace-nowrap px-4 py-2.5 font-semibold', c.className)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className={clsx('border-b border-line last:border-0', (rowHref || onRowClick) && 'cursor-pointer hover:bg-canvas/70')}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('a,button,input,select,label')) return;
                if (onRowClick) onRowClick(r);
                else if (rowHref) window.location.assign(rowHref(r));
              }}
            >
              {columns.map((c) => (
                <td key={c.key} className={clsx('px-4 py-3 align-middle', c.className)}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Modal (side panel) ──
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus(), 30);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/30 animate-[fade-in_.2s_ease-out]" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={clsx('absolute inset-y-0 right-0 flex w-full flex-col bg-surface shadow-2xl animate-[slide-in_.25s_ease-out]', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-[1rem] font-semibold">{title}</h2>
          <button onClick={onClose} className={btn('ghost', 'sm')} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ── Toasts ──
const ToastCtx = createContext<(msg: string, tone?: 'ok' | 'error') => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; tone: 'ok' | 'error' }[]>([]);
  const push = useCallback((msg: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, msg, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-[60] grid gap-2">
        {items.map((t) => (
          <div key={t.id} className={clsx('max-w-sm rounded-lg px-4 py-3 text-[0.85rem] shadow-lg animate-[fade-in_.2s_ease-out]', t.tone === 'error' ? 'bg-danger text-white' : 'bg-ink text-white')}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'up' | 'down' }) {
  return (
    <div className="card grid gap-1 p-5">
      <p className="text-[0.76rem] font-medium uppercase tracking-[0.06em] text-muted">{label}</p>
      <p className="font-[family-name:var(--font-display)] text-[1.9rem] leading-tight tabular">{value}</p>
      {sub && <p className={clsx('text-[0.78rem]', tone === 'up' ? 'text-success' : tone === 'down' ? 'text-danger' : 'text-muted')}>{sub}</p>}
    </div>
  );
}

export function FilterTabs({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string; count?: number }[] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-ink/[0.04] p-1" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)} className={clsx('rounded-md px-3 py-1.5 text-[0.8rem] font-medium transition-colors', value === o.value ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink')}>
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 text-muted tabular">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
