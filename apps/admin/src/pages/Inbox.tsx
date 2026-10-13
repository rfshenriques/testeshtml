import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { REPLY_INTENTS } from '@sitewright/shared-types';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { cn, fmtDate, relTime } from '@/lib/utils';
import { PageHeader, QueryState, Button, Select, Textarea, Field, ConfirmDialog, StageLabel, StatusLabel, DotLabel, EmptyState, Card, Checkbox, Loading, statusTone } from '@/components/ui';
import type { InboxItem } from '@/lib/types';
import type { ReplyIntent } from '@/lib/types';

export function InboxPage() {
  const [intent, setIntent] = React.useState('');
  const [showHandled, setShowHandled] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(null);
  const q = useQuery({ queryKey: [...keys.inbox, intent, showHandled], queryFn: () => api.inbox.list({ handled: showHandled, intent: intent || undefined }), refetchInterval: 30_000 });
  const items = q.data ?? [];
  const current = items.find((i) => i.id === selected) ?? items[0] ?? null;
  return (
    <>
      <PageHeader
        title="Inbox"
        description="Replies with classified intent. Any reply stops the sequence; nothing is answered automatically."
        actions={
          <>
            <Select aria-label="Intent filter" className="w-44" value={intent} onChange={(e) => setIntent(e.target.value)}>
              <option value="">All intents</option>
              {REPLY_INTENTS.map((i) => (
                <option key={i} value={i}>
                  {i.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
            <Checkbox id="show-handled" label={<span className="text-sm">Show handled</span>} checked={showHandled} onChange={(e) => setShowHandled(e.target.checked)} />
          </>
        }
      />
      <QueryState query={q} empty={<EmptyState className="rounded-lg border bg-card" title="Inbox zero" description={showHandled ? 'No handled replies match.' : 'No unhandled replies.'} />} loading={<Loading rows={5} className="rounded-lg border bg-card" />}>
        {(list) => (
          <div className="grid gap-6 lg:grid-cols-[minmax(300px,1fr)_2fr]">
            <ul className="max-h-[75vh] divide-y self-start overflow-auto rounded-lg border bg-card" aria-label="Replies">
              {list.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setSelected(r.id)} className={cn('w-full px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring', current?.id === r.id && 'bg-[color-mix(in_oklab,var(--primary)_6%,transparent)]')} aria-current={current?.id === r.id}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate font-medium">{r.lead.businessName}</div>
                      <span className="shrink-0 text-sm text-muted-fg">{relTime(r.receivedAt)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-sm text-muted-fg">{r.subject ?? '(no subject)'}</div>
                    <div className="mt-1.5 flex items-center gap-2 text-sm">
                      <DotLabel tone={statusTone(r.intent)}>{r.intent.replace(/_/g, ' ')}</DotLabel>
                      <span className="text-muted-fg tabular-nums">{(r.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {current ? <ReplyPanel key={current.id} r={current} /> : <EmptyState title="Select a reply" />}
          </div>
        )}
      </QueryState>
    </>
  );
}

function ReplyPanel({ r }: { r: InboxItem }) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: keys.inbox });
    void qc.invalidateQueries({ queryKey: keys.dashboard });
    void qc.invalidateQueries({ queryKey: keys.lead(r.leadId) });
  };
  const [draft, setDraft] = React.useState(r.suggestedDraft ?? '');
  const [intent, setIntent] = React.useState<ReplyIntent>(r.intent);
  const [confirm, setConfirm] = React.useState<'send' | 'suppress' | null>(null);
  const send = useMutation({ mutationFn: () => api.inbox.reply(r.id, draft), onSuccess: () => { toast.success('Reply sent'); setConfirm(null); refresh(); } });
  const handled = useMutation({ mutationFn: () => api.inbox.handled(r.id), onSuccess: () => { toast.success('Marked handled'); refresh(); } });
  const reclassify = useMutation({ mutationFn: () => api.inbox.reclassify(r.id, intent), onSuccess: () => { toast.success('Reclassified'); refresh(); } });
  const suppress = useMutation({ mutationFn: () => api.inbox.suppress(r.id), onSuccess: () => { toast.success('Suppressed'); setConfirm(null); refresh(); } });
  const lead = r.lead;
  return (
    <Card className="self-start p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link to={`/leads/${lead.id}`} className="text-lg font-semibold hover:underline">
            {lead.businessName}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-fg">
            <StageLabel stage={lead.stage} />
            <span>
              {lead.city} {lead.countryCode} · {lead.vertical ?? lead.primaryType ?? '—'} · score {lead.score?.toFixed(2) ?? '—'}
            </span>
            <Link to={`/leads/${lead.id}/studio`} className="text-primary hover:underline">
              Studio
            </Link>
            {lead.previewUrl && (
              <a href={lead.previewUrl} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
                Preview
              </a>
            )}
            {lead.quoteUrl && (
              <a href={lead.quoteUrl} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
                Quote
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm text-muted-fg">
          <span>{fmtDate(r.receivedAt)}</span>
          <span className="flex items-center gap-2">
            <StatusLabel status={r.intent} />
            <span className="tabular-nums">{(r.confidence * 100).toFixed(0)}%</span>
            {r.handled && <StatusLabel status="handled" muted />}
          </span>
        </div>
      </div>

      <div className="mt-5 border-t pt-5">
        <div className="text-sm text-muted-fg">
          From <span className="text-fg">{r.fromEmail}</span> · {r.subject ?? '(no subject)'}
          {r.classifiedBy && <span> · classified by {r.classifiedBy}</span>}
        </div>
        <pre className="mt-2 max-h-64 overflow-auto rounded-md border bg-muted/40 p-4 font-sans text-base leading-relaxed whitespace-pre-wrap">{r.raw}</pre>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3 border-t pt-5">
        <Field label="Reclassify intent" htmlFor="re-intent">
          <Select id="re-intent" className="w-56" value={intent} onChange={(e) => setIntent(e.target.value as ReplyIntent)}>
            {REPLY_INTENTS.map((i) => (
              <option key={i} value={i}>
                {i.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="outline" disabled={intent === r.intent} loading={reclassify.isPending} onClick={() => reclassify.mutate()}>
          Apply
        </Button>
      </div>

      <div className="mt-5 border-t pt-5">
        <Field label="Reply" htmlFor="draft" hint="You are replying as yourself from the sending mailbox. The compliance footer is appended by the server.">
          <Textarea id="draft" rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={r.suggestedDraft ? undefined : 'No draft was suggested. Write the reply here.'} />
        </Field>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={!draft.trim() || r.handled} onClick={() => setConfirm('send')}>
            Send reply
          </Button>
          <Button variant="outline" disabled={r.handled} loading={handled.isPending} onClick={() => handled.mutate()}>
            Mark handled
          </Button>
          <Button variant="destructive" className="ml-auto" onClick={() => setConfirm('suppress')}>
            Suppress
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirm === 'send'}
        onClose={() => setConfirm(null)}
        onConfirm={() => send.mutateAsync()}
        title="Send this reply"
        confirmLabel="Send now"
        acknowledge="I have read this and am sending it myself."
        blastRadius={<>One email to <strong>{r.fromEmail}</strong> ({lead.businessName}) from the original sending mailbox. {draft.length} characters.</>}
      >
        <pre className="max-h-40 overflow-auto rounded-md border bg-muted/40 p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap">{draft}</pre>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'suppress'}
        onClose={() => setConfirm(null)}
        onConfirm={() => suppress.mutateAsync()}
        title="Suppress this business"
        confirmLabel="Suppress"
        destructive
        typeToConfirm="SUPPRESS"
        blastRadius={<><strong>Permanent.</strong> {r.fromEmail}, the lead&apos;s place id and its contact addresses are added to the append-only suppression list. Any queued messages are cancelled. Cannot be undone from the UI.</>}
      />
    </Card>
  );
}
