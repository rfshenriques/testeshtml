import * as React from 'react';
import { cn } from '@/lib/utils';

/** White surface on the page background: 1px border, 12px radius, 20px padding (via `p-5` at call sites or Section). */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border bg-card text-card-fg', className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 px-5 pt-5 pb-3', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-semibold leading-6', className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-fg', className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />;
}

/** Label 13px muted · number 28px semibold · optional 13px footnote. Equal heights inside a grid. */
export function StatTile({ label, value, hint, tone, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'default' | 'warning' | 'critical' | 'success'; className?: string }) {
  return (
    <Card className={cn('flex h-full flex-col p-5', className)}>
      <div className="text-sm text-muted-fg">{label}</div>
      <div className={cn('mt-2 text-2xl font-semibold tracking-[-0.01em] tabular-nums', tone === 'warning' && 'text-warn-fg', tone === 'critical' && 'text-bad-fg', tone === 'success' && 'text-good-fg')}>{value}</div>
      {hint && <div className="mt-1.5 text-sm text-muted-fg">{hint}</div>}
    </Card>
  );
}

/** Every page: 22px title, one-line 15px muted description, primary action top right. */
export function PageHeader({ title, description, actions, meta, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; meta?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0">
        {meta && <div className="mb-1">{meta}</div>}
        <h1 className="text-xl font-semibold tracking-[-0.01em]">{title}</h1>
        {description && <p className="mt-1 text-base text-muted-fg">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A card with a 17px heading. Use at page level; inside another surface use `SubSection`. */
export function Section({ title, description, actions, children, className, bodyClassName }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </CardHeader>
      <CardContent className={cn('flex-1', bodyClassName)}>{children}</CardContent>
    </Card>
  );
}

/** Heading + content with no card around it: for grouping inside drawers, dialogs and cards. */
export function SubSection({ title, description, actions, children, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0', className)}>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-6">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-muted-fg">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Thin horizontal rule between sub-sections. */
export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-t', className)} />;
}
