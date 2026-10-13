# Go live: from empty database to the first real outreach

The console's **Ops → Go-live checklist** runs these checks live and names the fix for each gap.
This page is the long version. Everything is a Railway variable on the `api` service unless stated;
after changing variables, redeploy.

## 1. Keys (10 minutes)

| What | Variable(s) | Where to get it |
|---|---|---|
| Google Places (discovery, listing photos) | `GOOGLE_MAPS_API_KEY` | Google Cloud console → enable **Places API (New)** → API key restricted to that API |
| Claude (classification, website copy, reply triage) | `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` | console.anthropic.com → API keys. `LLM_DAILY_USD_CAP` caps daily spend (default 25). |
| Email verification (required before any send) | `EMAIL_VERIFY_PROVIDER=zerobounce`, `EMAIL_VERIFY_API_KEY` | zerobounce.net (100 free credits, then ~16 USD / 2,000). NeverBounce also supported. Without a provider the built-in check never marks an address *valid*, and the gate only sends to valid addresses. |
| Email sending | see §3 | |

## 2. Your identity (printed on every mockup, email footer and proposal)

`AGENCY_NAME`, `AGENCY_URL`, `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_REG_NO`, `LEGAL_ENTITY_ADDRESS`,
`PRIVACY_POLICY_URL`, `DPO_EMAIL`. The checklist flags placeholder values. Also set a long random
`ADMIN_API_TOKEN` once, before sending anything: it signs the unsubscribe, takedown and booking links.

## 3. Email that does not land in spam

1. **Never send from your main domain.** Buy a look-alike: `get-youragency.com`, `youragency-studio.com`.
   Reputation damage stays on the look-alike; your real inbox stays clean.
2. **Mailboxes.** Create 1–2 real mailboxes on that domain at an email host (Google Workspace, Zoho,
   Fastmail): `firstname@get-youragency.com`. These receive replies and are the addresses the system
   sends *as*. The console shows the mailbox each message goes out from (Outreach → Mailboxes; every
   message row carries its mailbox).
3. **Amazon SES** (recommended; the adapter is built in).
   - SES console → Verified identities → add the domain → **Easy DKIM**: add the three CNAME records.
   - Add SPF: `TXT @ "v=spf1 include:amazonses.com include:<your email host's spf> ~all"`.
   - Add DMARC: `TXT _dmarc "v=DMARC1; p=quarantine; rua=mailto:dmarc@get-youragency.com"` (start at `p=none` only if DKIM is not passing yet).
   - MX stays pointed at your email host (replies must arrive somewhere).
   - Request **production access** (SES accounts start in a sandbox that can only send to verified addresses).
   - IAM user with `ses:SendEmail` → `EMAIL_PROVIDER=ses`, `AWS_SES_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
   - Bounces/complaints: SES → Configuration set → SNS topic → HTTPS subscription to `https://<api>/webhooks/email`. Hard bounces and complaints are suppressed automatically.
   - Alternative: `EMAIL_PROVIDER=smartlead` + `SMARTLEAD_API_KEY` (Smartlead handles warm-up and inboxes).
4. **Replies.** `IMAP_HOST`, `IMAP_USER`, `IMAP_PASS` for the mailbox (or a catch-all). Replies are
   classified (interested / question / unsubscribe / hostile…) and drafted for you; nothing is ever
   auto-replied except the one-line unsubscribe confirmation.
5. **Add the domain and mailboxes in the console** (Outreach → Domains / Mailboxes). The checklist
   then checks MX, SPF, DKIM and DMARC live.
6. **Warm-up is enforced.** Week 1: 5/day and 0 real sends; week 2: 10/day with 20 % real; … week 6: 50/day.
   The 50 per mailbox per day ceiling cannot be raised. Add mailboxes, not volume.
7. **First 20 sends are hand-approved** (Outreach → Approval queue). Read them. Then it runs alone,
   Tue–Thu, 08–11 and 14–16 recipient-local, ≥90 s apart, max 4 touches per business, and it stops
   itself on bounce > 3 %, complaint > 0.1 %, or < 1 % replies after 200 sends.

## 4. Previews that survive redeploys

`STORAGE_DRIVER=s3` with the Railway bucket credentials (`S3_*`). On local disk, Railway wipes the
previews on every deploy and every link you sent goes dead.

## 5. Remove the demo data

Ops → Go-live checklist → **Remove demo data** (or `POST /admin/ops/purge-demo`). `DEMO_SEED` is
already `false`, so it will not come back.

## 6. First campaign

1. Campaigns → New: country, cities or bounding box, business types (tier A types convert best:
   dentists, lawyers, physios, vets, estate agents, accountants, plumbers, electricians, roofers,
   garages), USD budget cap, max leads. Budget is enforced at 100 %.
2. Start it. Discovery → website probe → enrichment → legal gate → profiling run on their own.
   Leads with a low-confidence classification stop in the Review queue; everything else continues to
   generation, publish and quote, then the sequence starts (first touches wait for your approval).
3. Watch Leads (filter stage), Review queue, Outreach → Approval queue, Inbox, Meetings.
4. Per lead: Design studio to change template/palette/type; Generator to edit copy; Site & quote for
   the proposal; Outreach tab for messages and bookings.

## 7. Countries

Email outreach is open by default only where the jurisdiction table allows it (see Compliance). DE,
IT, AT, ES, PL, CA, AU, ZA, NG are blocked for cold email; those leads go to the phone/letter bucket.
Every row is `confirmedByCounsel=false` until you confirm it.
