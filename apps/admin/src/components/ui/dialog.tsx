import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** side sheet instead of a centered modal */
  side?: 'right';
  /** Custom header content rendered below the title (e.g. a tab bar); only for side sheets. */
  header?: React.ReactNode;
  bodyClassName?: string;
}

const SIZES = { sm: 'max-w-[480px]', md: 'max-w-[560px]', lg: 'max-w-3xl', xl: 'max-w-6xl' };

/** Accessible modal: focus moves in, Escape closes, focus returns, backdrop click closes. */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md', side, header, bodyClassName }: DialogProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusable = node?.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button:not([data-close])');
    (focusable ?? node)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && node) {
        const els = Array.from(node.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
        if (els.length === 0) return;
        const first = els[0]!;
        const last = els[els.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const isSheet = side === 'right';
  return createPortal(
    <div className={cn('fixed inset-0 z-50 flex bg-black/40', isSheet ? 'justify-end' : 'items-center justify-center p-4')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn('flex flex-col bg-card text-card-fg shadow-xl outline-none', isSheet ? 'h-full w-full max-w-[880px] border-l' : cn('max-h-[90vh] w-full rounded-lg border', SIZES[size]))}
      >
        <div className={cn('flex flex-col', isSheet ? 'border-b px-6 pt-5' : 'px-6 pt-6')}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id={titleId} className={cn('font-semibold', isSheet ? 'text-xl tracking-[-0.01em]' : 'text-lg')}>
                {title}
              </h2>
              {description && (
                <div id={descId} className="mt-1 text-sm text-muted-fg">
                  {description}
                </div>
              )}
            </div>
            <Button data-close variant="ghost" size="iconSm" className="-mt-1 -mr-2 text-muted-fg" aria-label="Close" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
          {header && <div className="mt-4">{header}</div>}
        </div>
        <div className={cn('min-h-0 flex-1 overflow-y-auto', isSheet ? 'p-6' : 'px-6 pt-4 pb-6', bodyClassName)}>{children}</div>
        {footer && <div className={cn('flex flex-wrap items-center justify-end gap-2 border-t', isSheet ? 'px-6 py-4' : 'px-6 py-4')}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => unknown;
  title: React.ReactNode;
  /** Blast radius: what, and how many, will be affected. Always shown. */
  blastRadius: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** Require the operator to type this exact phrase before confirm enables. */
  typeToConfirm?: string;
  /** Require ticking an acknowledgement checkbox with this label. */
  acknowledge?: string;
  children?: React.ReactNode;
  loading?: boolean;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, blastRadius, confirmLabel = 'Confirm', destructive, typeToConfirm, acknowledge, children, loading }: ConfirmProps) {
  const [typed, setTyped] = React.useState('');
  const [acked, setAcked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) {
      setTyped('');
      setAcked(false);
      setBusy(false);
    }
  }, [open]);
  const ready = (!typeToConfirm || typed === typeToConfirm) && (!acknowledge || acked);
  const inputId = React.useId();
  const ackId = React.useId();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'danger' : 'default'}
            disabled={!ready}
            loading={busy || loading}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-md border bg-muted/50 px-4 py-3">
          <div className="t-label">Blast radius</div>
          <div className="mt-1.5 leading-relaxed">{blastRadius}</div>
        </div>
        {children}
        {typeToConfirm && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={inputId} className="text-sm font-medium">
              Type <span className="rounded bg-muted px-1 font-mono text-xs font-semibold">{typeToConfirm}</span> to confirm
            </label>
            <input id={inputId} data-autofocus autoComplete="off" className="h-9 rounded-md border bg-input px-3 font-mono text-base focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-ring" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
        )}
        {acknowledge && (
          <label htmlFor={ackId} className="flex items-start gap-2.5">
            <input id={ackId} type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--primary)]" checked={acked} onChange={(e) => setAcked(e.target.checked)} />
            <span className="leading-relaxed">{acknowledge}</span>
          </label>
        )}
      </div>
    </Dialog>
  );
}
