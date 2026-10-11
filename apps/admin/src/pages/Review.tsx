import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { VERTICALS, TONES, CTAS } from '@sitewright/shared-types';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { fmtDate, titleCase } from '@/lib/utils';
import { PageHeader, QueryState, Tabs, TabsList, TabsTrigger, Badge, Button, Field, Input, Select, Textarea, JsonView, StageBadge, GateBadge, EmptyState, Note, Card } from '@/components/ui';
import type { Classification, ReviewItemType, ReviewQueueItem } from '@/lib/types';

const TYPES: { id: ReviewItemType | ''; label: string }[] = [
  { id: '', label: 'All open' },
  { id: 'low_confidence_classification', label: 'Classifications' },
  { id: 'legal_gate_block', label: 'Gate blocks' },
  { id: 'copy_violation', label: 'Copy violations' },
  { id: 'reply_draft', label: 'Reply drafts' },
];

export function ReviewPage() {
  const [sp, setSp] = useSearchParams();
  const type = (sp.get('type') ?? '') as ReviewItemType | '';
  const q = useQuery({ queryKey: [...keys.review, type], queryFn: () => api.review.list(type ? { type } : undefined), refetchInterval: 30_000 });
  const counts = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of q.data ?? []) m[i.type] = (m[i.type] ?? 0) + 1;
    return m;
  }, [q.data]);
  return (
    <>
      <PageHeader title="Review queue" description="Human decisions the pipeline refuses to make on its own. Every item shows the inputs that led here." />
      <Tabs value={type} onValueChange={(v) => setSp(v ? { type: v } : {}, { replace: true })}>
        <TabsList aria-label="Review item type" className="h-auto flex-wrap">
          {TYPES.map((t) => (
            <TabsTrigger key={t.id} value={t.id} badge={t.id ? counts[t.id] : q.data?.length}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="mt-4">
        <QueryState query={q} empty={<EmptyState title="Queue is empty" description="Nothing needs a human decision right now." />}>
          {(items) => (
            <div className="grid gap-4 xl:grid-cols-2">
              {items.map((it) => (
                <ReviewCard key={it.id} item={it} />
              ))}
            </div>
          )}
        </QueryState>
      </div>
    </>
  );
}

function ReviewCard({ item }: { item: ReviewQueueItem }) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: keys.review });
    void qc.invalidateQueries({ queryKey: keys.leads });
    void qc.invalidateQueries({ queryKey: keys.dashboard });
  };
  const [note, setNote] = React.useState('');
  const approve = useMutation({ mutationFn: (edits?: Record<string, unknown>) => api.review.approve(item.id, edits), onSuccess: () => { toast.success('Approved'); refresh(); } });
  const reject = useMutation({ mutationFn: () => api.review.reject(item.id, note || undefined), onSuccess: () => { toast.success('Rejected'); refresh(); } });
  const p = item.payload as Record<string, unknown>;
  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="primary">{titleCase(item.type)}</Badge>
        <Link to={`/leads/${item.lead.id}`} className="font-medium hover:underline">
          {item.lead.businessName}
        </Link>
        <span className="text-xs text-muted-fg">
          {item.lead.city} {item.lead.countryCode}
        </span>
        <StageBadge stage={item.lead.stage} />
        <span className="ml-auto text-xs text-muted-fg">{fmtDate(item.createdAt)}</span>
      </div>
      {item.type === 'low_confidence_classification' && <ClassificationReview payload={p} onApprove={(c) => approve.mutate(c as unknown as Record<string, unknown>)} busy={approve.isPending} />}
      {item.type === 'legal_gate_block' && (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <GateBadge gate="blocked" /> <strong>{String(p.reason ?? item.lead.legalGateReason ?? 'blocked')}</strong>
          </div>
          {p.detail ? <JsonView value={p.detail} collapsed /> : null}
          <Note>
            Overriding requires a written justification and is logged. Prior-consent jurisdictions and suppressions cannot be overridden. <Link className="underline" to={`/leads/${item.lead.id}`}>Open the lead → Gate tab</Link> to override, or reject to leave it blocked.
          </Note>
        </div>
      )}
      {item.type === 'copy_violation' && (
        <div className="space-y-2 text-sm">
          <div>
            Field <code className="rounded bg-muted px-1">{String(p.field)}</code> — {String(p.violation)}
          </div>
          <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-xs">{String(p.text ?? '')}</pre>
          <Note>Approve accepts the text as-is (it will be re-checked by the hallucination guard at rebuild). Reject marks it for regeneration. To rewrite it yourself use the <Link className="underline" to={`/generator?leadId=${item.lead.id}`}>copy editor</Link>.</Note>
        </div>
      )}
      {item.type === 'reply_draft' && (
        <div className="space-y-2 text-sm">
          <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-xs">{String(p.draft ?? '')}</pre>
          <Note>Drafts are never auto-sent. Approve marks the draft as reviewed; the actual send happens from the <Link className="underline" to="/inbox">Inbox</Link> with explicit human confirmation.</Note>
        </div>
      )}
      {item.type !== 'low_confidence_classification' && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Rejection note (optional)" htmlFor={`note-${item.id}`} className="flex-1">
            <Input id={`note-${item.id}`} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button variant="outline" loading={reject.isPending} onClick={() => reject.mutate()}>
            Reject
          </Button>
          <Button loading={approve.isPending} onClick={() => approve.mutate(undefined)}>
            Approve
          </Button>
        </div>
      )}
      {item.type === 'low_confidence_classification' && (
        <div className="mt-2 flex items-end gap-2">
          <Field label="Rejection note" htmlFor={`note-${item.id}`} className="flex-1">
            <Input id={`note-${item.id}`} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button variant="outline" loading={reject.isPending} onClick={() => reject.mutate()}>
            Reject (mark lost)
          </Button>
        </div>
      )}
    </Card>
  );
}

function ClassificationReview({ payload, onApprove, busy }: { payload: Record<string, unknown>; onApprove: (c: Classification) => void; busy: boolean }) {
  const initial = (payload.classification ?? {}) as Partial<Classification>;
  const [c, setC] = React.useState<Classification>({
    vertical: initial.vertical ?? 'other',
    subVertical: initial.subVertical ?? '',
    servicesOffered: initial.servicesOffered ?? [],
    differentiators: initial.differentiators ?? [],
    toneOfVoice: initial.toneOfVoice ?? 'professional',
    primaryCTA: initial.primaryCTA ?? 'enquire',
    languageCode: initial.languageCode ?? 'en',
    confidence: initial.confidence ?? 0,
    insufficientData: initial.insufficientData ?? false,
  });
  const set = <K extends keyof Classification>(k: K, v: Classification[K]) => setC({ ...c, [k]: v });
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <Badge variant="warning">confidence {(c.confidence * 100).toFixed(0)}%</Badge>
        {c.insufficientData && <Badge variant="critical">model reported insufficient data</Badge>}
      </div>
      <details>
        <summary className="cursor-pointer text-xs text-primary">Inputs the model saw</summary>
        <JsonView value={payload.inputs ?? {}} />
      </details>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Field label="Vertical">
          <Select value={c.vertical} onChange={(e) => set('vertical', e.target.value as Classification['vertical'])}>
            {VERTICALS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Sub-vertical">
          <Input value={c.subVertical} maxLength={60} onChange={(e) => set('subVertical', e.target.value)} />
        </Field>
        <Field label="Language">
          <Input value={c.languageCode} onChange={(e) => set('languageCode', e.target.value)} />
        </Field>
        <Field label="Tone">
          <Select value={c.toneOfVoice} onChange={(e) => set('toneOfVoice', e.target.value as Classification['toneOfVoice'])}>
            {TONES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Primary CTA">
          <Select value={c.primaryCTA} onChange={(e) => set('primaryCTA', e.target.value as Classification['primaryCTA'])}>
            {CTAS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Services (one per line, max 8)" className="col-span-2 md:col-span-3">
          <Textarea rows={3} value={c.servicesOffered.join('\n')} onChange={(e) => set('servicesOffered', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 8))} />
        </Field>
        <Field label="Differentiators (one per line, max 4)" className="col-span-2 md:col-span-3">
          <Textarea rows={2} value={c.differentiators.join('\n')} onChange={(e) => set('differentiators', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 4))} />
        </Field>
      </div>
      <Button loading={busy} onClick={() => onApprove({ ...c, confidence: 1, insufficientData: false })}>
        Approve with these values
      </Button>
    </div>
  );
}
