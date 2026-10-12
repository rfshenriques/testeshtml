# Sitewright API contract

Base URL: `APP_BASE_URL` (default `http://localhost:3000`). All `/admin/*` routes require
`Authorization: Bearer <ADMIN_API_TOKEN>`. Public routes (`/p`, `/q`, `/u`, `/takedown`, `/t`,
`/webhooks`, `/health`) are unauthenticated and internet-facing.

Errors: `{ error: string, message: string, details?: object }`. Domain errors map to 403
(`BLOCKED`, `KILL_SWITCH`), 429 (`QUOTA_EXCEEDED`), 422 otherwise. Validation errors are 400.

Dates are ISO-8601 strings. Money is a number in the quote currency. Enums come from
`@sitewright/shared-types` and `prisma/schema.prisma`.

Shared shapes:

```ts
type LeadStage = 'discovered'|'qualified'|'enriched'|'profiled'|'generated'|'quoted'|'contacted'|'replied'|'won'|'lost'|'manual_review'|'suppressed';
type WebsiteStatus = 'none'|'social_only'|'parked'|'broken'|'http_only'|'live'|'unknown';
type LegalGate = 'pending'|'clear'|'blocked';
interface LeadSummary {
  id: string; campaignId: string; placeId: string; businessName: string; primaryType: string|null; vertical: string|null;
  countryCode: string; city: string|null; phone: string|null; websiteStatus: WebsiteStatus; websiteUrl: string|null;
  rating: number|null; reviewCount: number|null; score: number|null; stage: LeadStage; legalGate: LegalGate;
  legalGateReason: string|null; fallbackChannel: 'email'|'phone_outreach'|'postal_outreach'; priority: number;
  lastTouchAt: string|null; createdAt: string; primaryContact: { email: string; verification: string; source: string }|null;
  previewUrl: string|null; quoteUrl: string|null;
}
interface Paginated<T> { items: T[]; total: number; nextCursor: string|null }
```

## Ops / health

- `GET /health` → `{ status:'ok'|'degraded', killSwitch:boolean, db, redis, queues: QueueDepth[], external:[{host,reachable,ms}], time }`
- `GET /admin/ops/overview` → `{ killSwitch, queues: QueueDepth[], costs:{ byCategory:[{category,usd,units}], byCampaign:[{campaignId,usd}] }, quotas:[{api,day,used,cap}], alerts: Alert[], economics: Economics }`
  - `QueueDepth = { name, waiting, active, delayed, failed, completed, paused }`
  - `Economics = { totalUsd, leads, contacted, replied, won, costPerLead, costPerContacted, costPerReply, costPerWon }` (nulls when a denominator is 0)
- `POST /admin/ops/kill-switch` `{ engaged: boolean, reason?: string }` → `{ engaged }`
- `POST /admin/ops/queues/:key/pause` / `.../resume` (`key` = camelCase key of `QUEUES`, e.g. `discoveryTile`) → `{ paused }`
- `GET /admin/ops/costs?campaignId=` → `{ byCategory, economics }`
- `GET /admin/ops/alerts?all=1` → `Alert[]` (`{id, severity:'info'|'warning'|'critical', kind, message, meta, acknowledgedAt, createdAt}`)
- `POST /admin/ops/alerts/:id/ack`

## Dashboard

- `GET /admin/dashboard` →
```ts
{
  campaigns: { running: number; total: number; list: { id; name; status; countryCode; spendUsd; budgetUsdCap; leads: number }[] };
  funnel: { stage: LeadStage; count: number }[];
  sends: { today: number; cap: number; perMailbox: { id; address; status; sentToday; dailyCap; warmupStage }[] };
  replyQueue: number; reviewQueue: number; approvalQueue: number;
  alerts: Alert[]; economics: Economics; viewsToday: number;
}
```

## Compliance

- `GET /admin/compliance/jurisdictions` → `JurisdictionPolicy[]` (+ `confirmedByCounsel`, `updatedAt`)
- `PUT /admin/compliance/jurisdictions/:cc` body = policy fields → row
- `GET /admin/compliance/suppressions?email=&placeId=&domain=&reason=&take=&skip=` → `{ items: Suppression[], total }`
- `POST /admin/compliance/suppressions` `{ email?, placeId?, domain?, reason?, note?, leadId? }` (add only; there is no delete)
- `GET /admin/compliance/audit?action=&leadId=&since=&until=&take=&skip=` → `AuditLog[]`
- `GET /admin/compliance/retention` → `{ lastRun, lastResult, expiredSnapshotsPending, snapshotsTotal, suppressions, policy }`
- `POST /admin/compliance/retention/run`
- `POST /admin/compliance/leads/:id/gate/evaluate` → `GateResult = { result:'clear'|'blocked', reason, detail, overridden }`
- `POST /admin/compliance/leads/:id/gate/override` `{ reason, justification }` → `GateResult`

## Campaigns (territory + discovery)

- `GET /admin/place-types` → `{ tiers: { A: string[]; B: string[]; C: string[] } }`
- `GET /admin/campaigns` → `CampaignRow[]` = Campaign + `{ leads: number; tiles: { total, done, saturated, pending, searching, failed } }`
- `POST /admin/campaigns` `{ name, countryCode, geometry: CampaignGeometry, includedTypes: string[], excludedTypes?: string[], budgetUsdCap: number, maxLeads?: number, languageCode?: string, includeHttpOnly?: boolean }` → Campaign (status `draft`)
- `GET /admin/campaigns/:id` → `{ campaign, tiles: {total,done,saturated,pending,searching,failed}, leadsByStage: {stage,count}[], costs: {byCategory, economics}, estimate: { searchRequests, usd } }`
- `PATCH /admin/campaigns/:id` (draft only) same fields as create
- `POST /admin/campaigns/:id/start` → enqueues the root tile(s); status `running`
- `POST /admin/campaigns/:id/pause` / `resume` / `halt`
- `GET /admin/campaigns/:id/tiles` → `{ id, parentId, bbox:[minLng,minLat,maxLng,maxLat], depth, status, resultCount }[]`
- `POST /admin/campaigns/:id/requalify` → re-run website probe + scoring for all leads

`CampaignGeometry` (zod in shared-types): `{kind:'bbox',bbox}` | `{kind:'circle',center:{lat,lng},radiusM}` | `{kind:'polygon',geojson}` | `{kind:'cities',cities:[{name,lat,lng,radiusM}]}`.

## Leads

- `GET /admin/leads?campaignId=&stage=&legalGate=&countryCode=&vertical=&websiteStatus=&minScore=&q=&fallbackChannel=&sort=score|createdAt|lastTouchAt|priority&dir=asc|desc&take=50&cursor=` → `Paginated<LeadSummary>`
- `GET /admin/leads/:id` →
```ts
{
  lead: LeadSummary & { scoreBreakdown: ScoreBreakdown|null; classification: Classification|null; websiteProbe: object|null; gateOverride: object|null; notes: string|null; lat; lng; priceLevel; businessStatus };
  snapshot: { kind: 'details'|'search'; raw: object; fetchedAt; expiresAt }|null;   // latest unexpired Google content
  contacts: Contact[]; site: GeneratedSite|null; quote: Quote|null;
  messages: OutreachMessage[]; replies: Reply[]; events: LeadEvent[]; reviewItems: ReviewItem[]; tasks: CrmTask[];
  provisioning: Provisioning|null;
}
```
- `PATCH /admin/leads/:id` `{ notes?, priority?, fallbackChannel? }`
- `POST /admin/leads/:id/actions/:action` and `POST /admin/leads/bulk { ids: string[], action, payload? }`
  - actions: `requalify` | `enrich` | `verify` | `profile` | `generate` | `publish` | `quote` | `enqueue_outreach` | `stop_sequence` | `suppress` (payload `{reason?, note?}`) | `mark_lost` | `mark_won` | `set_priority` (payload `{priority}`)
  - response: `{ ok: true, enqueued?: number, results?: {id, ok, error?}[] }`
- `POST /admin/leads/:id/contacts` `{ email, source, sourceUrl?, emailType?: 'named'|'role_generic' }` → Contact (verification `unverified`; a verify job is enqueued)
- `POST /admin/leads/:id/contacts/:contactId/primary`
- `GET /admin/leads/:id/site` → `GeneratedSite` (copy, brief, template, previewUrl, views, expiresAt)
- `PUT /admin/leads/:id/site/copy` `{ copy: SiteCopy }` → saves and enqueues a rebuild
- `POST /admin/leads/:id/site/rebuild` `{ templateId?, colourScheme?, typography? }`
- `GET /admin/leads/:id/quote` → Quote | 404 ; `POST /admin/leads/:id/quote` `{ tier?: 'starter'|'business'|'premium', addOns?: string[] }` → Quote
- `POST /admin/leads/:id/tasks` `{ title, dueAt? }` ; `POST /admin/tasks/:id/done` ; `GET /admin/tasks?open=1`

## Review queue

- `GET /admin/review?type=&status=open` → `(ReviewItem & { lead: LeadSummary })[]`
  - types: `low_confidence_classification` (payload: `{classification, inputs}`), `legal_gate_block` (`{reason, detail}`), `copy_violation` (`{field, violation, text}`), `reply_draft` (`{replyId, draft}`)
- `POST /admin/review/:id/approve` `{ edits?: object }` — for a classification: `edits` = corrected Classification; lead continues to generation
- `POST /admin/review/:id/reject` `{ note? }` — lead marked `lost` (classification) or stays blocked (gate)

## Generator

- `GET /admin/generator/templates` → `{ id: TemplateFamily; verticals: string[]; sections: string[]; colourSchemes: ['a','b','c']; typography: ['a','b'] }[]`
- `GET /admin/generator/templates/:id/sample?colourScheme=a&typography=a` → `text/html` sample page built with fixture data (iframe-able)
- `GET /admin/generator/builds?take=` → recent `GeneratedSite` rows with lead summary

## Outreach

- `GET /admin/outreach/sequence` → `SequenceStep[]` ; `PUT /admin/outreach/sequence` `{ steps: SequenceStep[] }` (max 4)
- `GET /admin/outreach/domains` → `(SendingDomain & { mailboxes: Mailbox[] })[]` ; `POST /admin/outreach/domains` `{ domain }`
- `GET /admin/outreach/mailboxes` → `(Mailbox & { reputation: { bounceRate7d, bounceRate30d, complaintRate7d, complaintRate30d, replyRate, sent7d, sent30d } })[]`
- `POST /admin/outreach/mailboxes` `{ address, sendingDomain }` ; `POST /admin/outreach/mailboxes/:id/pause` `{reason?}` / `resume`
- `GET /admin/outreach/schedule?days=7` → `{ day: string; mailboxId; address; scheduled: number; cap: number }[]`
- `GET /admin/outreach/capacity` → `{ ceilingPerMailbox: 50, mailboxes, dailyCeiling, globalCap, usedToday }`
- `GET /admin/outreach/reputation?days=30` → `{ mailboxId; address; series: { day; sent; bounced; complained; replied }[] }[]`
- `GET /admin/outreach/approval-queue` → `(OutreachMessage & { lead: LeadSummary; contact: Contact })[]` (first-20 hand approval + any message flagged for review)
- `POST /admin/outreach/messages/:id/approve` / `POST /admin/outreach/messages/:id/cancel`
- `GET /admin/outreach/messages?leadId=&status=&take=` → `OutreachMessage[]`
- `GET /admin/outreach/messages/:id/preview` → `{ subject, bodyText, bodyHtml, headers }` (rendered with the compliance block)

## Inbox

- `GET /admin/inbox?handled=false&intent=` → `(Reply & { lead: LeadSummary })[]`
- `POST /admin/inbox/:id/reply` `{ body }` — human-confirmed send of a substantive reply (never automatic)
- `POST /admin/inbox/:id/handled`
- `POST /admin/inbox/:id/reclassify` `{ intent: ReplyIntent }`
- `POST /admin/inbox/:id/suppress` `{ note? }`

## Pricing

- `GET /admin/pricing` → `PricingConfig` ; `PUT /admin/pricing` `{ config: PricingConfig }`
- `POST /admin/pricing/preview` `{ leadId, tier?, addOns?: string[] }` → `QuoteComputation = { currency, recommendedTier, tiers: { [tier]: { buildFee, monthly, lineItems:[{label, oneOff, monthly}] } }, multiplier, reasoning: string[] }`

## Conversion + billing

- `GET /admin/conversion/provisioning` → `(Provisioning & { lead: LeadSummary })[]`
- `GET /admin/conversion/provisioning/:leadId` → Provisioning (checklist = `{key,label,done,doneAt,by,note}[]`)
- `POST /admin/conversion/provisioning/:leadId/items/:key` `{ done: boolean, note? }`
- `PUT /admin/conversion/provisioning/:leadId/onboarding` `{ form: object }`
- `GET /admin/billing/subscriptions` → `(ServiceSubscription & { lead: LeadSummary; usage: { month, used, included, overage } })[]`
- `GET /admin/billing/subscriptions/:id` → subscription + `updateRequests[]` + `invoices[]` + `sla`
- `POST /admin/billing/subscriptions/:id/update-requests` `{ description }` → UpdateRequest (billable=true when over allowance)
- `POST /admin/billing/update-requests/:id/complete`

## Public endpoints

- `GET /p/:slug` and `GET /p/:slug/*` — preview site. Headers: `X-Robots-Tag: noindex, nofollow, noarchive`, `Cache-Control: public, max-age=300`. 404 unknown, 410 after expiry/takedown.
- `GET /robots.txt` on the preview host → `User-agent: *\nDisallow: /`
- `POST /p/:slug/form` (contact form) → `{ ok: true, mockup: true }`
- `GET /takedown/:token` → hard-deletes the preview, suppresses, confirmation page
- `GET /u/:token`, `POST /u/:token` → unsubscribe (synchronous suppression)
- `GET /q/:slug` → proposal page (HTML) ; `POST /q/:slug/accept` `{ tier }` → `303` to Stripe Checkout ; `GET /q/:slug/decline` → suppression + takedown + confirmation
- `GET /t/:token` → click tracking redirect (302)
- `POST /webhooks/stripe` (raw body, signature verified) ; `POST /webhooks/email` (provider bounce/complaint notifications)

## Additions made during the build

- `GET /admin/enrichment/report?campaignId=` → `{ adapters:[{name,tried,candidates,valid,hitRate}], adapterStatus:[{name,available,unavailableReason,costPerLookupUsd}], coverage:{leads,withValidContact,rate}, channels:[{channel,count}] }`
- `GET /admin/review/counts` → `{ type, count }[]`
- `PATCH /admin/outreach/mailboxes/:id` `{ dailyCap }` → Mailbox (server clamps to 50)
- `POST /admin/outreach/domains/:id/pause` / `resume` (a burned domain cannot be resumed)
- `POST /admin/outreach/leads/:id/stop`, `POST /admin/outreach/ingest/poll`
- `POST /admin/preview/leads/:id/publish`, `POST /admin/preview/leads/:id/takedown`
- `GET /admin/leads/:id/site/files/*path` — local build output before publishing
- `POST /admin/conversion/quotes/:quoteId/accept` `{ tier? }` — manual acceptance (offline payment)
- `GET /q/:slug/thanks` — Stripe success page
- `GET /admin/ops/alerts` without `all=1` returns unacknowledged alerts only; `PUT /admin/compliance/jurisdictions/:cc` upserts.
- `GET /admin/leads/:id/site/variants` → `{ current, brand, images, templates, colourSchemes: ['a','b','c','brand'], typography: ['a','b'] }` (422 until the lead is profiled)
- `GET /admin/leads/:id/site/variant?template=&colourScheme=&typography=` → `text/html` of that style for the lead (built on demand, cached)
- `POST /admin/leads/:id/site/rebuild` `{ templateId?, colourScheme?: 'a'|'b'|'c'|'brand', typography? }` adopts a style
- `/p/:slug/photos/*` serves the listing photos as soon as they are stored (before publishing); pages still require publishing
- Pricing: `tiers.<tier>.nfcTags`, `addOns.nfcTagExtra.perTag`; repeat `'nfcTagExtra'` in `addOns` for quantity
