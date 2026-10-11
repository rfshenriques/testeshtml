import { useSyncExternalStore } from 'react';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { cn } from './utils';

export type ToastKind = 'success' | 'error' | 'info';
export interface Toast { id: number; kind: ToastKind; title: string; description?: string }

let toasts: Toast[] = [];
let seq = 1;
const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function push(kind: ToastKind, title: string, description?: string) {
  const id = seq++;
  toasts = [...toasts, { id, kind, title, description }];
  emit();
  setTimeout(() => dismiss(id), kind === 'error' ? 9000 : 4500);
  return id;
}
export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}
export const toast = {
  success: (title: string, description?: string) => push('success', title, description),
  error: (title: string, description?: string) => push('error', title, description),
  info: (title: string, description?: string) => push('info', title, description),
};

export function Toaster() {
  const list = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => toasts,
    () => toasts,
  );
  return (
    <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-80 flex-col gap-2">
      {list.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex items-start gap-2 rounded-md border bg-card p-3 text-sm shadow-lg',
            t.kind === 'error' && 'border-critical',
            t.kind === 'success' && 'border-success',
          )}
        >
          {t.kind === 'success' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : t.kind === 'error' ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />}
          <div className="min-w-0 flex-1">
            <div className="font-medium">{t.title}</div>
            {t.description && <div className="mt-0.5 break-words text-muted-fg">{t.description}</div>}
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="rounded p-0.5 text-muted-fg hover:text-fg">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
