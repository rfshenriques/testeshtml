import * as React from 'react';
import { cn } from '@/lib/utils';

interface TabsCtx { value: string; setValue: (v: string) => void; id: string }
const Ctx = React.createContext<TabsCtx | null>(null);

export function Tabs({ value, onValueChange, defaultValue, children, className }: { value?: string; onValueChange?: (v: string) => void; defaultValue?: string; children: React.ReactNode; className?: string }) {
  const [inner, setInner] = React.useState(defaultValue ?? '');
  const id = React.useId();
  const v = value ?? inner;
  const setValue = (n: string) => {
    setInner(n);
    onValueChange?.(n);
  };
  return (
    <Ctx.Provider value={{ value: v, setValue, id }}>
      <div className={className}>{children}</div>
    </Ctx.Provider>
  );
}

export function TabsList({ children, className, 'aria-label': ariaLabel }: { children: React.ReactNode; className?: string; 'aria-label'?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const onKey = (e: React.KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
    const i = tabs.findIndex((t) => t === document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : tabs.length - 1;
    tabs[next]?.focus();
    tabs[next]?.click();
  };
  return (
    <div ref={ref} role="tablist" aria-label={ariaLabel} onKeyDown={onKey} className={cn('inline-flex h-9 items-center gap-1 rounded-md bg-muted p-1 text-muted-fg', className)}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, className, badge }: { value: string; children: React.ReactNode; className?: string; badge?: React.ReactNode }) {
  const ctx = React.useContext(Ctx)!;
  const active = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${ctx.id}-tab-${value}`}
      aria-selected={active}
      aria-controls={`${ctx.id}-panel-${value}`}
      tabIndex={active ? 0 : -1}
      onClick={() => ctx.setValue(value)}
      className={cn('inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-ring', active ? 'bg-card text-fg shadow-xs' : 'hover:text-fg', className)}
    >
      {children}
      {badge !== undefined && badge !== null && badge !== 0 && <span className="rounded-full bg-accent px-1.5 text-xs text-primary tabular-nums">{badge}</span>}
    </button>
  );
}

export function TabsContent({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) {
  const ctx = React.useContext(Ctx)!;
  if (ctx.value !== value) return null;
  return (
    <div role="tabpanel" id={`${ctx.id}-panel-${value}`} aria-labelledby={`${ctx.id}-tab-${value}`} tabIndex={0} className={cn('mt-3 focus-visible:outline-2 focus-visible:outline-ring', className)}>
      {children}
    </div>
  );
}
