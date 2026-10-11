import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { REPLY_INTENTS } from '@sitewright/shared-types';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { cn, fmtDate, relTime } from '@/lib/utils';
import { PageHeader, QueryState, Badge, Button, Select, Textarea, Field, ConfirmDialog, StageBadge, EmptyState, Note, Card, Checkbox } from '@/components/ui';
import type { InboxItem, ReplyIntent } from '@/lib/types';

function intentVariant(i: ReplyIntent) {
  return i === 'interested' ? 'success' : i === 'question' ? 'primary' : i === 'hostile' || i === 'unsubscribe' ? 'critical' : i === 'not_interested' ? 'warning' : 'default';
}

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
        description="Replies with classified intent. Any reply stops the sequence. Replies are never answered automatically."
        actions={
          <>
            <Select aria-label="Intent filter" className="w-40" value={intent} onChange={(e) => setIntent(e.target.value)}>
              <option value="">All intents</option>
              {REPLY_INTENTS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </Select>
            <Checkbox id="show-handled" label="Show handled" checked={showHandled} onChange={(e) => setShowHandled(e.target.checked)} />
          </>
        }
      />
      <QueryState query={q} empty={<EmptyState title="Inbox zero" description={showHandled ? 'No handled replies match.' : 'No unhandled replies.'} />}>
        {(list) => (
          <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_2fr]">
            <ul className="max-h-[75vh] divide-y overflow-auto rounded-md border bg-card" aria-label="Replies">
              {list.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setSelected(r.id)} className={cn('w-full p-3 text-left text-sm hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring', current?.id === r.id && 'bg-accent')} aria-current={current?.id === r.id}>
                    <div className="flex items-center gap-2">
                      <Badge variant={intentVariant(r.intent)}>{r.intent}</Badge>
                      <span className="text-xs text-muted-fg">{(r.confidence * 100).toFixed(0)}%</span>
                      <span className="ml-auto text-xs text-muted-fg">{relTime(r.receivedAt)}</span>
                    </div>
                    <div className="mt-1 truncate font-medium">{r.lead.businessName}</div>
                    <div className="truncate text-xs text-muted-fg">{r.subject ?? '(no subject)'} · {r.fromEmail}</div>
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
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={intentVariant(r.intent)}>{r.intent}</Badge>
        <span className="text-xs text-muted-fg">
          confidence {(r.confidence * 100).toFixed(0)}% · classified by {r.classifiedBy ?? 'unknown'}
        </span>
        {r.handled && <Badge variant="success">handled</Badge>}
        <span className="ml-auto text-xs text-muted-fg">{fmtDate(r.receivedAt)}</span>
      </div>
      <div className="rounded-md border p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/leads/${lead.id}`} className="font-medium hover:underline">
            {lead.businessName}
          </Link>
          <StageBadge stage={lead.stage} />
          <span className="text-xs text-muted-fg">
            {lead.city} {lead.countryCode} · {lead.vertical ?? lead.primaryType ?? '—'} · score {lead.score?.toFixed(2) ?? '—'}
          </span>
          {lead.previewUrl && (
            <a href={lead.previewUrl} target="_blank" rel="noreferrer noopener" className="text-xs text-primary hover:underline">
              preview
            </a>
          )}
          {lead.quoteUrl && (
            <a href={lead.quoteUrl} target="_blank" rel="noreferrer noopener" className="text-xs text-primary hover:underline">
              quote
            </a>
          )}
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-muted-fg">From {r.fromEmail} · {r.subject ?? '(no subject)'}</div>
        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">{r.raw}</pre>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <Field label="Reclassify intent" htmlFor="re-intent">
          <Select id="re-intent" value={intent} onChange={(e) => setIntent(e.target.value as ReplyIntent)}>
            {REPLY_INTENTS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="outline" disabled={intent === r.intent} loading={reclassify.isPending} onClick={() => reclassify.mutate()}>
          Apply
        </Button>
      </div>
      <Field label="Suggested draft (edit before sending)" htmlFor="draft">
        <Textarea id="draft" rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={r.suggestedDraft ? undefined : 'No draft was suggested. Write the reply here.'} />
      </Field>
      <Note>Sending is a human action: you are replying as yourself from the sending mailbox. The compliance footer is appended by the server.</Note>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!draft.trim() || r.handled} onClick={() => setConfirm('send')}>
          Send reply (human-confirmed)
        </Button>
        <Button variant="outline" disabled={r.handled} loading={handled.isPending} onClick={() => handled.mutate()}>
          Mark handled
        </Button>
        <Button variant="destructive" onClick={() => setConfirm('suppress')}>
          Suppress
        </Button>
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
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-xs">{draft}</pre>
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
