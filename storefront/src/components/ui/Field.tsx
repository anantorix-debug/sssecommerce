import clsx from 'clsx';
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, useId } from 'react';

const control =
  'w-full rounded-md border border-line-strong bg-surface px-3.5 text-[0.95rem] text-ink placeholder:text-muted/80 transition-colors duration-200 focus:border-ink focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-accent/25 disabled:bg-paper-2 disabled:text-muted aria-[invalid=true]:border-danger';

interface FieldShell {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
}

function Shell({ id, label, hint, error, optional, className, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className={clsx('grid gap-1.5', className)}>
      <label htmlFor={id} className="text-[0.82rem] font-medium text-ink-soft">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[0.8rem] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[0.8rem] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & FieldShell;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, hint, error, optional, className, id, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell id={fid} label={label} hint={hint} error={error} optional={optional} className={className}>
      <input
        ref={ref}
        id={fid}
        className={clsx(control, 'h-12')}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
        {...rest}
      />
    </Shell>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & FieldShell & { options: { value: string; label: string }[] };

export function Select({ label, hint, error, optional, className, id, options, ...rest }: SelectProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell id={fid} label={label} hint={hint} error={error} optional={optional} className={className}>
      <select id={fid} className={clsx(control, 'h-12 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%278%27 fill=%27none%27%3E%3Cpath d=%27M1 1.5 6 6.5l5-5%27 stroke=%27%23191714%27 stroke-width=%271.5%27/%3E%3C/svg%3E")] bg-[length:12px] bg-[right_1rem_center] bg-no-repeat pr-10')} aria-invalid={error ? true : undefined} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Shell>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldShell;

export function Textarea({ label, hint, error, optional, className, id, ...rest }: TextareaProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell id={fid} label={label} hint={hint} error={error} optional={optional} className={className}>
      <textarea id={fid} className={clsx(control, 'min-h-28 py-3 leading-relaxed')} aria-invalid={error ? true : undefined} {...rest} />
    </Shell>
  );
}

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={rest.id ?? id} className={clsx('flex cursor-pointer items-start gap-3 text-[0.92rem] text-ink-soft', className)}>
      <input id={rest.id ?? id} type="checkbox" className="mt-[3px] h-[18px] w-[18px] shrink-0 rounded-[4px] accent-[var(--color-accent)]" {...rest} />
      <span>{label}</span>
    </label>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-danger/25 bg-danger/[0.05] px-4 py-3 text-[0.9rem] text-danger">
      {message}
    </div>
  );
}
