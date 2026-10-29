import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * default    filled accent, the one primary action on a screen
 * outline    secondary, neutral 1px border
 * destructive outlined red; `danger` is the filled red reserved for destructive confirms and the kill switch
 * ghost      tertiary, text only
 * link       inline text link
 */
export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium ap-press disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-fg hover:bg-[color-mix(in_oklab,var(--primary)_88%,black)]',
        secondary: 'border bg-card text-fg hover:bg-muted',
        outline: 'border bg-card text-fg hover:bg-muted',
        ghost: 'text-fg hover:bg-muted',
        destructive: 'border border-[color-mix(in_oklab,var(--destructive)_55%,transparent)] bg-card text-destructive hover:bg-bad-bg',
        danger: 'bg-destructive text-destructive-fg hover:opacity-90',
        link: 'h-auto px-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-3.5 text-base',
        sm: 'h-8 px-3 text-sm',
        lg: 'h-10 px-5 text-base',
        icon: 'size-9',
        iconSm: 'size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, children, disabled, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
    {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
    {children}
  </button>
));
Button.displayName = 'Button';
