import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-9 w-full rounded-md border bg-input px-3 py-1 text-sm shadow-xs placeholder:text-muted-fg disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn('flex min-h-20 w-full rounded-md border bg-input px-3 py-2 text-sm shadow-xs placeholder:text-muted-fg disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring', className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn('flex h-9 w-full rounded-md border bg-input px-2 py-1 text-sm shadow-xs disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring', className)}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-xs font-medium text-muted-fg', className)} {...props} />;
}

/** Label + control stack. */
export function Field({ label, htmlFor, hint, children, className }: { label: React.ReactNode; htmlFor?: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-fg">{hint}</p>}
    </div>
  );
}

export function Checkbox({ className, label, id, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
  const inner = <input id={id} type="checkbox" className={cn('size-4 accent-[var(--primary)] focus-visible:outline-2 focus-visible:outline-ring', className)} {...props} />;
  if (!label) return inner;
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 text-sm">
      {inner}
      <span>{label}</span>
    </label>
  );
}

export function Switch({ checked, onCheckedChange, disabled, label, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; label?: string; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring',
        checked ? 'bg-primary border-primary' : 'bg-muted',
      )}
    >
      <span className={cn('inline-block size-4 rounded-full bg-card shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
    </button>
  );
}
