/**
 * Single HTTP client for the Sitewright admin API (docs/API.md).
 * Every /admin request carries `Authorization: Bearer <token>` from the auth store.
 * A 401 clears the token so the login gate takes over. Errors throw `ApiError`
 * (surfaced as toasts by the QueryClient's global handlers).
 */
import type {
  ActionResult, Alert, ApiErrorBody, ApprovalItem, AuditLog, Campaign, CampaignDetail, CampaignRow, Capacity, Contact,
  CreateCampaignBody, Dashboard, DomainWithMailboxes, GateResult, GeneratedSite, Health, InboxItem, JurisdictionRow,
  LeadAction, LeadDetail, LeadSummary, LeadsQuery, Mailbox, MailboxWithReputation, MessagePreview, OpsCosts, OpsOverview,
  OutreachMessage, Paginated, PlaceTypeTiers, PricingConfig, Provisioning, Quote, QuoteComputation, ReplyIntent,
  ReputationSeries, RetentionStatus, ReviewQueueItem, ScheduleRow, SequenceStep, SiteCopy, Suppression, TemplateInfo,
  TierName, CrmTask, Classification, SiteVariants, SiteVariantParams, Meeting,
} from './types';
import type { Availability } from '@sitewright/shared-types';
import { auth } from './auth';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(status: number, body: Partial<ApiErrorBody> | null, fallback: string) {
    super(body?.message || fallback);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error || `HTTP_${status}`;
    this.details = body?.details;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function qs(params?: Query): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const BASE_URL = (import.meta.env?.VITE_API_BASE_URL as string | undefined) ?? '';

interface RequestOptions { raw?: 'text'; signal?: AbortSignal; auth?: boolean }

export async function request<T>(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: opts.raw === 'text' ? 'text/html, */*' : 'application/json' };
  const token = auth.getToken();
  if (opts.auth !== false && token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: opts.signal });
  } catch (e) {
    throw new ApiError(0, { error: 'NETWORK', message: (e as Error).message || 'Network error' }, 'Network error');
  }
  if (res.status === 401 && opts.auth !== false) {
    auth.setToken(null);
    throw new ApiError(401, { error: 'UNAUTHORIZED', message: 'Admin token rejected. Please sign in again.' }, 'Unauthorized');
  }
  if (!res.ok) {
    let parsed: Partial<ApiErrorBody> | null = null;
    try {
      parsed = (await res.json()) as ApiErrorBody;
    } catch {
      parsed = null;
    }
    throw new ApiError(res.status, parsed, `${res.status} ${res.statusText}`);
  }
  if (opts.raw === 'text') return (await res.text()) as unknown as T;
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

const get = <T>(path: string, params?: Query, opts?: RequestOptions) => request<T>('GET', `${path}${qs(params)}`, undefined, opts);
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body);
const put = <T>(path: string, body?: unknown) => request<T>('PUT', path, body);
const patch = <T>(path: string, body?: unknown) => request<T>('PATCH', path, body);

export const api = {
  health: {
    get: () => get<Health>('/health', undefined, { auth: false }),
  },
  ops: {
    overview: () => get<OpsOverview>('/admin/ops/overview'),
    killSwitch: (engaged: boolean, reason?: string) => post<{ engaged: boolean }>('/admin/ops/kill-switch', { engaged, reason }),
    pauseQueue: (key: string) => post<{ paused: boolean }>(`/admin/ops/queues/${encodeURIComponent(key)}/pause`),
    resumeQueue: (key: string) => post<{ paused: boolean }>(`/admin/ops/queues/${encodeURIComponent(key)}/resume`),
    costs: (campaignId?: string) => get<OpsCosts>('/admin/ops/costs', { campaignId }),
    alerts: (all?: boolean) => get<Alert[]>('/admin/ops/alerts', all ? { all: 1 } : undefined),
    ackAlert: (id: string) => post<void>(`/admin/ops/alerts/${encodeURIComponent(id)}/ack`),
  },
  dashboard: {
    get: () => get<Dashboard>('/admin/dashboard'),
  },
  compliance: {
    jurisdictions: () => get<JurisdictionRow[]>('/admin/compliance/jurisdictions'),
    putJurisdiction: (cc: string, body: Partial<JurisdictionRow>) => put<JurisdictionRow>(`/admin/compliance/jurisdictions/${encodeURIComponent(cc)}`, body),
    suppressions: (params: { email?: string; placeId?: string; domain?: string; reason?: string; take?: number; skip?: number }) =>
      get<{ items: Suppression[]; total: number }>('/admin/compliance/suppressions', params),
    addSuppression: (body: { email?: string; placeId?: string; domain?: string; reason?: string; note?: string; leadId?: string }) =>
      post<Suppression>('/admin/compliance/suppressions', body),
    audit: (params: { action?: string; leadId?: string; since?: string; until?: string; take?: number; skip?: number }) => get<AuditLog[]>('/admin/compliance/audit', params),
    retention: () => get<RetentionStatus>('/admin/compliance/retention'),
    runRetention: () => post<unknown>('/admin/compliance/retention/run'),
    evaluateGate: (leadId: string) => post<GateResult>(`/admin/compliance/leads/${encodeURIComponent(leadId)}/gate/evaluate`),
    overrideGate: (leadId: string, body: { reason: string; justification: string }) => post<GateResult>(`/admin/compliance/leads/${encodeURIComponent(leadId)}/gate/override`, body),
  },
  campaigns: {
    placeTypes: () => get<PlaceTypeTiers>('/admin/place-types'),
    list: () => get<CampaignRow[]>('/admin/campaigns'),
    create: (body: CreateCampaignBody) => post<Campaign>('/admin/campaigns', body),
    get: (id: string) => get<CampaignDetail>(`/admin/campaigns/${encodeURIComponent(id)}`),
    update: (id: string, body: Partial<CreateCampaignBody>) => patch<Campaign>(`/admin/campaigns/${encodeURIComponent(id)}`, body),
    start: (id: string) => post<unknown>(`/admin/campaigns/${encodeURIComponent(id)}/start`),
    pause: (id: string) => post<unknown>(`/admin/campaigns/${encodeURIComponent(id)}/pause`),
    resume: (id: string) => post<unknown>(`/admin/campaigns/${encodeURIComponent(id)}/resume`),
    halt: (id: string) => post<unknown>(`/admin/campaigns/${encodeURIComponent(id)}/halt`),
    tiles: (id: string) => get<import('./types').Tile[]>(`/admin/campaigns/${encodeURIComponent(id)}/tiles`),
    requalify: (id: string) => post<ActionResult>(`/admin/campaigns/${encodeURIComponent(id)}/requalify`),
  },
  leads: {
    list: (q: LeadsQuery) => get<Paginated<LeadSummary>>('/admin/leads', q as Query),
    get: (id: string) => get<LeadDetail>(`/admin/leads/${encodeURIComponent(id)}`),
    update: (id: string, body: { notes?: string; priority?: number; fallbackChannel?: string }) => patch<LeadDetail['lead']>(`/admin/leads/${encodeURIComponent(id)}`, body),
    action: (id: string, action: LeadAction, payload?: Record<string, unknown>) => post<ActionResult>(`/admin/leads/${encodeURIComponent(id)}/actions/${action}`, payload),
    bulk: (ids: string[], action: LeadAction, payload?: Record<string, unknown>) => post<ActionResult>('/admin/leads/bulk', { ids, action, payload }),
    addContact: (id: string, body: { email: string; source: string; sourceUrl?: string; emailType?: 'named' | 'role_generic' }) => post<Contact>(`/admin/leads/${encodeURIComponent(id)}/contacts`, body),
    setPrimaryContact: (id: string, contactId: string) => post<unknown>(`/admin/leads/${encodeURIComponent(id)}/contacts/${encodeURIComponent(contactId)}/primary`),
    site: (id: string) => get<GeneratedSite>(`/admin/leads/${encodeURIComponent(id)}/site`),
    saveCopy: (id: string, copy: SiteCopy) => put<GeneratedSite>(`/admin/leads/${encodeURIComponent(id)}/site/copy`, { copy }),
    rebuild: (id: string, body: { templateId?: string; colourScheme?: string; typography?: string }) => post<ActionResult>(`/admin/leads/${encodeURIComponent(id)}/site/rebuild`, body),
    /** Style gallery inputs: current combo, brand palette, photos, template families. 422 until the lead has a classification. */
    siteVariants: (id: string) => get<SiteVariants>(`/admin/leads/${encodeURIComponent(id)}/site/variants`),
    /** Fully built page for one template/scheme/typography combo (self-contained HTML). First build of a combo takes ~5 s; render it via iframe `srcDoc`. */
    siteVariantHtml: (id: string, params: SiteVariantParams, signal?: AbortSignal) => get<string>(`/admin/leads/${encodeURIComponent(id)}/site/variant`, { ...params }, { raw: 'text', signal }),
    quote: (id: string) => get<Quote>(`/admin/leads/${encodeURIComponent(id)}/quote`),
    createQuote: (id: string, body: { tier?: TierName; addOns?: string[] }) => post<Quote>(`/admin/leads/${encodeURIComponent(id)}/quote`, body),
    addTask: (id: string, body: { title: string; dueAt?: string }) => post<CrmTask>(`/admin/leads/${encodeURIComponent(id)}/tasks`, body),
  },
  tasks: {
    list: (open?: boolean) => get<CrmTask[]>('/admin/tasks', open ? { open: 1 } : undefined),
    done: (id: string) => post<unknown>(`/admin/tasks/${encodeURIComponent(id)}/done`),
  },
  scheduling: {
    availability: () => get<Availability>('/admin/scheduling/availability'),
    saveAvailability: (availability: Availability) => put<Availability>('/admin/scheduling/availability', { availability }),
    slots: (days = 14) => get<{ timezone: string; slots: string[] }>('/admin/scheduling/slots', { days }),
  },
  meetings: {
    list: (upcoming?: boolean) => get<Meeting[]>('/admin/meetings', upcoming ? { upcoming: 1 } : undefined),
    cancel: (id: string, reason?: string) => post<Meeting>(`/admin/meetings/${encodeURIComponent(id)}/cancel`, { reason }),
    complete: (id: string) => post<Meeting>(`/admin/meetings/${encodeURIComponent(id)}/complete`),
    noShow: (id: string) => post<Meeting>(`/admin/meetings/${encodeURIComponent(id)}/no-show`),
    resend: (id: string) => post<{ ok: boolean }>(`/admin/meetings/${encodeURIComponent(id)}/resend`),
  },
  review: {
    list: (params?: { type?: string; status?: string }) => get<ReviewQueueItem[]>('/admin/review', { status: 'open', ...params }),
    approve: (id: string, edits?: Partial<Classification> | Record<string, unknown>) => post<unknown>(`/admin/review/${encodeURIComponent(id)}/approve`, edits ? { edits } : {}),
    reject: (id: string, note?: string) => post<unknown>(`/admin/review/${encodeURIComponent(id)}/reject`, { note }),
  },
  generator: {
    templates: () => get<TemplateInfo[]>('/admin/generator/templates'),
    /** Returns the sample page HTML; render it with an iframe `srcDoc` (the iframe cannot send the bearer header itself). */
    sample: (id: string, params: { colourScheme: string; typography: string }) => get<string>(`/admin/generator/templates/${encodeURIComponent(id)}/sample`, params, { raw: 'text' }),
    builds: (take = 20) => get<GeneratedSite[]>('/admin/generator/builds', { take }),
  },
  outreach: {
    sequence: () => get<SequenceStep[]>('/admin/outreach/sequence'),
    saveSequence: (steps: SequenceStep[]) => put<SequenceStep[]>('/admin/outreach/sequence', { steps }),
    domains: () => get<DomainWithMailboxes[]>('/admin/outreach/domains'),
    addDomain: (domain: string) => post<DomainWithMailboxes>('/admin/outreach/domains', { domain }),
    mailboxes: () => get<MailboxWithReputation[]>('/admin/outreach/mailboxes'),
    addMailbox: (body: { address: string; sendingDomain: string }) => post<Mailbox>('/admin/outreach/mailboxes', body),
    pauseMailbox: (id: string, reason?: string) => post<Mailbox>(`/admin/outreach/mailboxes/${encodeURIComponent(id)}/pause`, { reason }),
    resumeMailbox: (id: string) => post<Mailbox>(`/admin/outreach/mailboxes/${encodeURIComponent(id)}/resume`),
    /** NOT in docs/API.md yet: PATCH /admin/outreach/mailboxes/:id { dailyCap } (server must clamp to MAILBOX_DAILY_CEILING and the warmup stage). */
    setMailboxCap: (id: string, dailyCap: number) => patch<Mailbox>(`/admin/outreach/mailboxes/${encodeURIComponent(id)}`, { dailyCap }),
    schedule: (days = 7) => get<ScheduleRow[]>('/admin/outreach/schedule', { days }),
    capacity: () => get<Capacity>('/admin/outreach/capacity'),
    reputation: (days = 30) => get<ReputationSeries[]>('/admin/outreach/reputation', { days }),
    approvalQueue: () => get<ApprovalItem[]>('/admin/outreach/approval-queue'),
    approveMessage: (id: string) => post<unknown>(`/admin/outreach/messages/${encodeURIComponent(id)}/approve`),
    cancelMessage: (id: string) => post<unknown>(`/admin/outreach/messages/${encodeURIComponent(id)}/cancel`),
    messages: (params: { leadId?: string; status?: string; take?: number }) => get<OutreachMessage[]>('/admin/outreach/messages', params),
    preview: (id: string) => get<MessagePreview>(`/admin/outreach/messages/${encodeURIComponent(id)}/preview`),
  },
  inbox: {
    list: (params: { handled?: boolean; intent?: string }) => get<InboxItem[]>('/admin/inbox', { handled: params.handled === undefined ? 'false' : String(params.handled), intent: params.intent }),
    reply: (id: string, body: string) => post<unknown>(`/admin/inbox/${encodeURIComponent(id)}/reply`, { body }),
    handled: (id: string) => post<unknown>(`/admin/inbox/${encodeURIComponent(id)}/handled`),
    reclassify: (id: string, intent: ReplyIntent) => post<unknown>(`/admin/inbox/${encodeURIComponent(id)}/reclassify`, { intent }),
    suppress: (id: string, note?: string) => post<unknown>(`/admin/inbox/${encodeURIComponent(id)}/suppress`, { note }),
  },
  pricing: {
    get: () => get<PricingConfig>('/admin/pricing'),
    save: (config: PricingConfig) => put<PricingConfig>('/admin/pricing', { config }),
    preview: (body: { leadId: string; tier?: TierName; addOns?: string[] }) => post<QuoteComputation>('/admin/pricing/preview', body),
  },
  conversion: {
    provisioning: () => get<(Provisioning & { lead: LeadSummary })[]>('/admin/conversion/provisioning'),
    provisioningFor: (leadId: string) => get<Provisioning>(`/admin/conversion/provisioning/${encodeURIComponent(leadId)}`),
    setItem: (leadId: string, key: string, body: { done: boolean; note?: string }) => post<Provisioning>(`/admin/conversion/provisioning/${encodeURIComponent(leadId)}/items/${encodeURIComponent(key)}`, body),
  },
};

export type Api = typeof api;
