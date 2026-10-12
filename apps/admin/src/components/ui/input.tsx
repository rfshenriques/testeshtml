import * as React from 'react';
import { cn } from '@/lib/utils';

const control = 'h-9 w-full rounded-md border bg-input text-base text-fg placeholder:text-muted-fg disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring focus-visible:border-primary';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type = 'text', ...props }, ref) => (
  <input ref={ref} type={type} className={cn('flex px-3', control, type === 'number' && 'tabular-nums', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn('flex min-h-20 px-3 py-2 leading-normal', control, 'h-auto', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn('ui-select flex pr-9 pl-3', control, className)} {...props}>
    {children}
  </select>
));
Select.displayName = 'Select';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium text-fg', className)} {...props} />;
}

/** Label (13px, 500) + control, 6px gap; 13px muted helper text below. */
export function Field({ label, htmlFor, hint, children, className }: { label: React.ReactNode; htmlFor?: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {label ? <Label htmlFor={htmlFor}>{label}</Label> : null}
      {children}
      {hint && <p className="text-sm text-muted-fg">{hint}</p>}
    </div>
  );
}

export function Checkbox({ className, label, id, ...props }: React.ComponentProps<'input'> & { label?: React.ReactNode }) {
  const inner = <input id={id} type="checkbox" className={cn('size-4 shrink-0 rounded accent-[var(--primary)] focus-visible:outline-2 focus-visible:outline-ring', className)} {...props} />;
  if (!label) return inner;
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 text-base">
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
        checked ? 'border-primary bg-primary' : 'border-border bg-muted',
      )}
    >
      <span className={cn('inline-block size-4 rounded-full bg-card shadow-sm transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
    </button>
  );
}

/** Row of segmented options (window pickers, device toggles). */
export function SegmentedControl<T extends string>({ value, options, onChange, 'aria-label': ariaLabel, size = 'sm' }: { value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void; 'aria-label': string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('inline-flex items-center rounded-md border bg-card p-0.5', size === 'sm' ? 'h-8' : 'h-9')}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('inline-flex h-full items-center gap-1.5 rounded-[6px] px-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring', value === o.value ? 'bg-muted text-fg' : 'text-muted-fg hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
