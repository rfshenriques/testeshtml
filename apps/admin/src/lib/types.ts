/**
 * Response/request shapes mirroring docs/API.md. Enums and zod-derived types come from
 * `@sitewright/shared-types`; everything here is the HTTP contract on top of them.
 */
import type {
  Classification,
  ScoreBreakdown,
  SiteCopy,
  ContentBrief,
  PricingConfig,
  SequenceStep,
  JurisdictionPolicy,
  CampaignGeometry,
  TemplateFamily,
  TierName,
  ReplyIntentValue,
  ColourSchemeId,
  TypographyId,
} from '@sitewright/shared-types';
import { COLOUR_SCHEMES, TYPOGRAPHY_PAIRINGS } from '@sitewright/shared-types';

export type { Classification, ScoreBreakdown, SiteCopy, ContentBrief, PricingConfig, SequenceStep, JurisdictionPolicy, CampaignGeometry, TemplateFamily, TierName };

export type LeadStage =
  | 'discovered' | 'qualified' | 'enriched' | 'profiled' | 'generated' | 'quoted' | 'contacted'
  | 'replied' | 'won' | 'lost' | 'excluded' | 'manual_review' | 'suppressed';
export const LEAD_STAGES: LeadStage[] = ['discovered', 'qualified', 'enriched', 'profiled', 'generated', 'quoted', 'contacted', 'replied', 'won', 'lost', 'excluded', 'manual_review', 'suppressed'];

export type WebsiteStatus = 'none' | 'social_only' | 'parked' | 'broken' | 'http_only' | 'live' | 'unknown';
export const WEBSITE_STATUSES: WebsiteStatus[] = ['none', 'social_only', 'parked', 'broken', 'http_only', 'live', 'unknown'];
export type LegalGate = 'pending' | 'clear' | 'blocked';
export type FallbackChannel = 'email' | 'phone_outreach' | 'postal_outreach';
export type CampaignStatus = 'draft' | 'running' | 'paused' | 'complete' | 'halted';
export type TileStatus = 'pending' | 'searching' | 'saturated' | 'done' | 'failed';
export type VerifyState = 'unverified' | 'valid' | 'risky' | 'invalid' | 'catchall';
export type EmailType = 'named' | 'role_generic' | 'catchall_guess';
export type MsgStatus = 'queued' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'replied' | 'failed' | 'cancelled';
export type MailboxStatus = 'warming' | 'active' | 'paused' | 'burned';
export type DomainStatus = MailboxStatus;
export type ReplyIntent = ReplyIntentValue;
export type ReviewItemType = 'low_confidence_classification' | 'legal_gate_block' | 'copy_violation' | 'reply_draft';
export type ReviewItemStatus = 'open' | 'approved' | 'rejected' | 'edited';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface ApiErrorBody { error: string; message: string; details?: Record<string, unknown> }

export interface LeadSummary {
  id: string; campaignId: string; placeId: string; businessName: string; primaryType: string | null; vertical: string | null;
  countryCode: string; city: string | null; phone: string | null; websiteStatus: WebsiteStatus; websiteUrl: string | null;
  rating: number | null; reviewCount: number | null; score: number | null; stage: LeadStage; legalGate: LegalGate;
  legalGateReason: string | null; fallbackChannel: FallbackChannel; priority: number;
  lastTouchAt: string | null; createdAt: string; primaryContact: { email: string; verification: string; source: string } | null;
  previewUrl: string | null; quoteUrl: string | null;
}
export interface Paginated<T> { items: T[]; total: number; nextCursor: string | null }

// ---- Ops / health
export interface QueueDepth { name: string; waiting: number; active: number; delayed: number; failed: number; completed: number; paused: boolean }
export interface Economics {
  totalUsd: number; leads: number; contacted: number; replied: number; won: number;
  costPerLead: number | null; costPerContacted: number | null; costPerReply: number | null; costPerWon: number | null;
}
export interface Alert { id: string; severity: AlertSeverity; kind: string; message: string; meta: Record<string, unknown> | null; acknowledgedAt: string | null; createdAt: string }
export interface Health {
  status: 'ok' | 'degraded'; killSwitch: boolean; db: unknown; redis: unknown; queues: QueueDepth[];
  external: { host: string; reachable: boolean; ms: number }[]; time: string;
}
export interface CostByCategory { category: string; usd: number; units: number }
export interface CostByCampaign { campaignId: string; usd: number; name?: string }
export interface OpsOverview {
  killSwitch: boolean; queues: QueueDepth[];
  costs: { byCategory: CostByCategory[]; byCampaign: CostByCampaign[] };
  quotas: { api: string; day: string; used: number; cap: number }[];
  alerts: Alert[]; economics: Economics;
}
export interface OpsCosts { byCategory: CostByCategory[]; economics: Economics }

// ---- Dashboard
export interface DashboardMailbox { id: string; address: string; status: MailboxStatus; sentToday: number; dailyCap: number; warmupStage: number }
export interface Dashboard {
  campaigns: { running: number; total: number; list: { id: string; name: string; status: CampaignStatus; countryCode: string; spendUsd: number; budgetUsdCap: number; leads: number }[] };
  funnel: { stage: LeadStage; count: number }[];
  sends: { today: number; cap: number; perMailbox: DashboardMailbox[] };
  replyQueue: number; reviewQueue: number; approvalQueue: number;
  alerts: Alert[]; economics: Economics; viewsToday: number;
}

// ---- Compliance
export interface JurisdictionRow extends JurisdictionPolicy { confirmedByCounsel: boolean; updatedAt?: string }
export interface Suppression { id: string; emailHash: string | null; placeId: string | null; domain: string | null; reason: string; note: string | null; createdAt: string }
export interface AuditLog { id: string; action: string; actor: string; leadId: string | null; subjectId: string | null; detail: Record<string, unknown>; createdAt: string }
export interface RetentionStatus { lastRun: string | null; lastResult: Record<string, unknown> | null; expiredSnapshotsPending: number; snapshotsTotal: number; suppressions: number; policy: Record<string, unknown> }
export interface GateResult { result: 'clear' | 'blocked'; reason: string | null; detail?: unknown; overridden: boolean }

// ---- Campaigns
export interface Campaign {
  id: string; name: string; status: CampaignStatus; countryCode: string; geometry: CampaignGeometry;
  includedTypes: string[]; excludedTypes: string[]; budgetUsdCap: number | string; spendUsd: number | string; maxLeads: number | null;
  languageCode: string | null; includeHttpOnly: boolean; createdAt: string; updatedAt: string;
}
export interface TileCounts { total: number; done: number; saturated: number; pending: number; searching: number; failed: number }
export interface CampaignRow extends Campaign { leads: number; tiles: TileCounts }
export interface CampaignDetail {
  campaign: Campaign; tiles: TileCounts; leadsByStage: { stage: LeadStage; count: number }[];
  costs: { byCategory: CostByCategory[]; economics: Economics }; estimate: { searchRequests: number; usd: number };
}
export interface Tile { id: string; parentId: string | null; bbox: [number, number, number, number]; depth: number; status: TileStatus; resultCount: number }
export interface CreateCampaignBody {
  name: string; countryCode: string; geometry: CampaignGeometry; includedTypes: string[]; excludedTypes?: string[];
  budgetUsdCap: number; maxLeads?: number; languageCode?: string; includeHttpOnly?: boolean;
}
export interface PlaceTypeTiers { tiers: { A: string[]; B: string[]; C: string[] } }

// ---- Leads
export interface Contact {
  id: string; leadId: string; email: string; emailType: EmailType; source: string; sourceUrl: string | null; sourceLicence?: string | null;
  confidence: number; verification: VerifyState; verifiedAt: string | null; verifier?: string | null; isPrimary: boolean; createdAt: string;
}
/** a|b|c are a template's fixed palettes; brand|brand2|brand3 derive the palette from the lead's own Google photos (fall back to a when there is no brand). */
export type ColourScheme = ColourSchemeId;
export const COLOUR_SCHEME_IDS: ColourScheme[] = [...COLOUR_SCHEMES];
export type Typography = TypographyId;
export const TYPOGRAPHY_IDS: Typography[] = [...TYPOGRAPHY_PAIRINGS];
/** Palette extracted from the business's own material. Hex colours. */
export interface Brand { source: 'photos' | 'operator'; primary: string; accent: string; heroBg?: string; swatches: string[] }
/** Photo used on the mockup; `credit` is the attribution text shown with it. */
export interface SiteImage { url: string; alt: string; credit: string | null; source?: 'google_places' | 'unsplash' | 'operator' }
export interface GeneratedSite {
  id: string; leadId: string; templateId: string; colourScheme: ColourScheme; typography: Typography; contentBrief: ContentBrief | Record<string, unknown>;
  copy: SiteCopy; copyViolations: unknown | null; buildHash: string; previewUrl: string | null; previewSlug: string; expiresAt: string;
  takenDownAt: string | null; publishedAt: string | null; views: number; lastViewedAt: string | null; createdAt: string; updatedAt: string;
  brand: Brand | null; images: SiteImage[];
  lead?: LeadSummary;
}
/** GET /admin/leads/:id/site/variants — the style gallery inputs (422 until the lead is profiled). */
export interface SiteVariants {
  current: { templateId: string; colourScheme: ColourScheme; typography: Typography } | null;
  brand: Brand | null;
  images: SiteImage[];
  templates: { id: TemplateFamily | string; label?: string; concept?: string; verticals: string[]; sections: string[] }[];
  colourSchemes: ColourScheme[];
  typography: Typography[];
}
export interface SiteVariantParams { template: string; colourScheme: ColourScheme; typography: Typography }
export interface Quote {
  id: string; leadId: string; slug: string; currency: string; buildFee: number | string; monthlyFee: number | string; tier: TierName;
  lineItems: { label: string; oneOff: number; monthly: number }[]; allTiers: Record<string, unknown>; validUntil: string; acceptedAt: string | null; createdAt: string;
}
export interface OutreachMessage {
  id: string; leadId: string; contactId: string; sequenceStep: number; mailboxId: string; subject: string; bodyHtml: string; bodyText: string;
  status: MsgStatus; providerId: string | null; scheduledFor: string | null; sentAt: string | null; error: string | null; createdAt: string;
}
export interface Reply {
  id: string; leadId: string; messageId: string | null; fromEmail: string; receivedAt: string; subject: string | null; raw: string;
  intent: ReplyIntent; confidence: number; classifiedBy: string | null; suggestedDraft: string | null; handled: boolean; createdAt: string;
}
export interface LeadEvent { id: string; leadId: string; type: string; payload: Record<string, unknown>; createdAt: string }
export interface ReviewItem {
  id: string; leadId: string; type: ReviewItemType; status: ReviewItemStatus; payload: Record<string, unknown>;
  resolution: unknown | null; resolvedBy: string | null; resolvedAt: string | null; createdAt: string;
}
export interface ReviewQueueItem extends ReviewItem { lead: LeadSummary }
export interface CrmTask { id: string; leadId: string; title: string; dueAt: string | null; doneAt: string | null; createdAt: string }
export type MeetingStatus = 'scheduled' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export interface Meeting {
  id: string; leadId: string | null; siteId: string | null; kind: 'agency_call' | 'mockup_demo'; source: string; startAt: string; endAt: string; timezone: string;
  name: string; email: string; phone: string | null; notes: string | null; status: MeetingStatus; confirmedAt: string | null; cancelledAt: string | null; cancelReason: string | null;
  remindersSent: { index: number; at: string; kind: 'confirm' | 'reminder'; hoursBefore: number }[]; createdAt: string; updatedAt: string;
  lead?: { id: string; businessName: string; city: string | null; countryCode: string; stage: string } | null;
}
export interface ProvisioningItem { key: string; label: string; done: boolean; doneAt: string | null; by: string | null; note: string | null }
export interface Provisioning { leadId: string; checklist: ProvisioningItem[]; onboardingForm?: Record<string, unknown> | null; [k: string]: unknown }

export interface LeadDetail {
  lead: LeadSummary & {
    scoreBreakdown: ScoreBreakdown | null; classification: Classification | null; websiteProbe: Record<string, unknown> | null;
    gateOverride: { by?: string; justification?: string; reason?: string; at?: string } | null; notes: string | null;
    lat: number | null; lng: number | null; priceLevel: number | null; businessStatus: string | null;
  };
  snapshot: { kind: 'details' | 'search'; raw: Record<string, unknown>; fetchedAt: string; expiresAt: string } | null;
  contacts: Contact[]; site: GeneratedSite | null; quote: Quote | null;
  messages: OutreachMessage[]; replies: Reply[]; events: LeadEvent[]; reviewItems: ReviewItem[]; tasks: CrmTask[]; meetings?: Meeting[];
  provisioning: Provisioning | null;
}
export type LeadAction =
  | 'requalify' | 'enrich' | 'verify' | 'profile' | 'generate' | 'publish' | 'quote' | 'enqueue_outreach'
  | 'stop_sequence' | 'suppress' | 'mark_lost' | 'mark_won' | 'set_priority';
export interface ActionResult { ok: true; enqueued?: number; results?: { id: string; ok: boolean; error?: string }[] }
export interface LeadsQuery {
  campaignId?: string; stage?: string; legalGate?: string; countryCode?: string; vertical?: string; websiteStatus?: string;
  minScore?: number; q?: string; fallbackChannel?: string; sort?: 'score' | 'createdAt' | 'lastTouchAt' | 'priority'; dir?: 'asc' | 'desc';
  take?: number; cursor?: string;
}

// ---- Generator
export interface TemplateInfo { id: TemplateFamily; label?: string; concept?: string; verticals: string[]; sections: string[]; colourSchemes: string[]; typography: string[] }

// ---- Outreach
export interface Mailbox {
  id: string; address: string; sendingDomainId: string; sendingDomain: string; dailyCap: number; sentToday: number; warmupStage: number;
  warmupStartedAt: string; status: MailboxStatus; lastSentAt: string | null; pauseReason: string | null; createdAt: string;
}
export interface MailboxReputation { bounceRate7d: number; bounceRate30d: number; complaintRate7d: number; complaintRate30d: number; replyRate: number; sent7d: number; sent30d: number }
export interface MailboxWithReputation extends Mailbox { reputation: MailboxReputation }
export interface SendingDomain { id: string; domain: string; status: DomainStatus; dmarcPolicy: string; createdAt: string }
export interface DomainWithMailboxes extends SendingDomain { mailboxes: Mailbox[] }
export interface ScheduleRow { day: string; mailboxId: string; address: string; scheduled: number; cap: number }
export interface Capacity { ceilingPerMailbox: number; mailboxes: number; dailyCeiling: number; globalCap: number; usedToday: number }
export interface ReputationSeries { mailboxId: string; address: string; series: { day: string; sent: number; bounced: number; complained: number; replied: number }[] }
export interface ApprovalItem extends OutreachMessage { lead: LeadSummary; contact: Contact }
export interface MessagePreview { subject: string; bodyText: string; bodyHtml: string; headers: Record<string, string> }

// ---- Inbox
export interface InboxItem extends Reply { lead: LeadSummary }

// ---- Pricing
export interface QuoteComputation {
  currency: string; recommendedTier: TierName;
  tiers: Record<string, { buildFee: number; monthly: number; lineItems: { label: string; oneOff: number; monthly: number }[] }>;
  multiplier: number; reasoning: string[];
}
