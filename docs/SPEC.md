Sitewright — Build Specification
Working name: Sitewright Purpose: Find businesses that have a Google Business Profile
but no real website, enrich them with a contact email, auto-generate a tailored website
preview, and send a compliant outreach email containing that preview plus a priced quote
for build, content management and maintenance.

Audience for this document: Claude Code. This is the authoritative spec. Build against it
phase by phase. Where a decision is marked DECISION , stop and ask the operator before
assuming.




0. Reality checks that constrain the design
Read this section before writing any code. Several obvious-seeming approaches do not
work.


0.1 Google Places returns no email address
The Places API (New) exposes displayName , formattedAddress , location ,
nationalPhoneNumber , internationalPhoneNumber , websiteUri , primaryType , types ,
rating , userRatingCount , priceLevel , regularOpeningHours , photos , reviews ,
businessStatus . There is no email field and there never has been. Email must be derived in
a dedicated enrichment stage (§6.4). Plan for 10–30% coverage depending on country and
vertical, not 90%.


0.2 Google's caching rules constrain the schema
Under Google Maps Platform terms, place_id may be stored indefinitely. Other Places
content (name, address, phone, rating, photos) may only be cached for a limited period,
conventionally 30 days, and must then be refreshed or purged. The schema therefore splits
place_ref (permanent, place_id + our own derived fields) from place_snapshot (expiring,
raw Google content with a expires_at ). Do not merge these tables. A nightly job purges
expired snapshots.

Anything the operator has independently verified or that a human has typed (a confirmed
email, notes, quote figures) lives outside the snapshot table and is not subject to purge.


0.3 Do not scrape Google Maps
Scraping maps.google.com or the Maps front end breaches Google's terms and will get
keys and IPs banned. Use the official Places API only. This is not negotiable in this build.


0.4 Global coverage is a cost problem, not a technical one
Indicative Places API pricing at time of writing: Text/Nearby Search on the Pro field tier
around $32 per 1,000 requests, Place Details in a similar band, each search request
returning at most 20 results. Roughly:

   100,000 businesses discovered ≈ 5,000 search requests ≈ $160

   Details on the ~20% that qualify ≈ 20,000 requests ≈ $400–500

   ≈ $600 per 100,000 businesses scanned

Verify current pricing at build time; it changes. The architectural consequence is fixed
regardless: the system runs territory campaigns with explicit budget ceilings, not a world
crawl. A "worldwide" campaign is expressed as a queue of country/city campaigns the
operator funds one at a time.


0.5 Cold email deliverability is the actual bottleneck
Most transactional providers (Postmark, SendGrid, Mailgun on standard terms) prohibit cold
outreach and will terminate the account. Sending cold volume from the agency's primary
domain will burn that domain's reputation permanently. The design uses separate sending
domains, per-domain warmup, per-mailbox daily caps, and either Amazon SES with owned
domains or a purpose-built cold-email API (Smartlead, Instantly). See §11.


0.6 Generating someone's website unasked has legal edges
The preview is a concept mockup, and must be labelled and behave as one:

    <meta name="robots" content="noindex,nofollow"> on every preview page, plus X-
   Robots-Tag header and a blanket robots.txt disallow on the preview host.

   A persistent, non-dismissible banner: "Unofficial concept mockup prepared by
   {Agency}. Not affiliated with or endorsed by {Business}."

   No use of the business's logo unless it came from a public source and is displayed only
   within the mockup context. Prefer a generated wordmark.

   One-click takedown link in every email that hard-deletes the preview and adds the
   business to the global suppression list.

   Previews auto-expire (default 30 days) and 410 afterwards.
0.7 Photo licensing
Google Place Photos carry attribution and usage requirements and are not a safe source for
a website you are proposing to sell. Use instead, in order of preference: (1) AI-generated
imagery, (2) licensed stock via the Unsplash/Pexels APIs matched to vertical, (3) clearly
marked grey placeholders. Every image on a preview carries a data-placeholder="true"
attribute and the proposal text says images are indicative and will be replaced with the
client's own photography.




1. Legal and compliance module (build this first, not last)
This is a first-class module ( modules/compliance ), not a checkbox. Nothing may be sent
unless it passes the gate.


1.1 Jurisdiction rules engine
A per-country policy table drives whether and how a lead may be contacted.


 interface JurisdictionPolicy {
     countryCode: string;                 // ISO 3166-1 alpha-2
     b2bColdEmailAllowed: boolean;        // corporate addresses of legal persons
     soleTraderTreatedAsIndividual: boolean;
     priorConsentRequired: boolean;       // if true → outreach blocked, phone/post only
     requiresPhysicalAddressInFooter: boolean;
     requiresDataSourceDisclosure: boolean;          // GDPR Art.14
     maxFollowUps: number;
     optOutHonourWindowHours: number;                // must be ≤ 72
     notes: string;
 }


Ship with entries for the EU/EEA states you intend to target, plus UK, US, CA, AU, ZA, NG.
Default for any country not in the table is blocked until an operator explicitly adds a policy.
Fail closed.

Known positions to encode (have the operator confirm with counsel before go-live):

     Germany: effectively requires prior consent for commercial email under UWG §7. Set
     priorConsentRequired: true , i.e. blocked for email.

     Italy: strict. Block by default.

     Malta, Ireland, Netherlands, Nordics: corporate-subscriber B2B email generally
     permissible with clear identity and opt-out; sole traders treated as individuals.
   UK: PECR permits B2B email to corporate subscribers; sole traders and partnerships are
   individual subscribers and need consent.

   US: CAN-SPAM, opt-out model, physical postal address mandatory in footer.

   Nigeria: NDPA 2023 applies; treat as consent-preferred, legitimate interest arguable for
   B2B. Operator decision.


1.2 Mandatory content in every first email
Generated by the compliance module, not by the copywriter LLM:

1. Sender legal entity name, registration number, registered address.

2. Why they were contacted: "We identified your business on Google Maps as operating
   without a website."

3. GDPR Art. 14 notice: the source of the data (Google Maps public business listing +
   named enrichment source), the purpose, the legal basis (legitimate interest), and a link
   to the privacy notice and to the right to object.

4. One-click unsubscribe link, plus List-Unsubscribe and List-Unsubscribe-Post
   headers.

5. One-click "delete the mockup you made" link.


1.3 Suppression
   Global suppression table, append-only, keyed by SHA-256 of the lowercased email plus
   a separate key on place_id and on normalised domain.

   Any unsubscribe, bounce (hard), spam complaint, hostile reply, or takedown request
   writes to it immediately and synchronously before any further send.

   Every send is checked against suppression at dispatch time, not at queue time.

   Suppression is permanent and cannot be cleared from the UI. Removal requires a
   database migration with an audit note.


1.4 Retention
   Unengaged leads: purge contact data 90 days after last touch.

   Objection received: purge within 30 days, retain only the suppression hash and a
   minimal record of the objection.

   Full audit log of every send, every consent-relevant decision, and every suppression
   event, retained 24 months.
2. Architecture

2.1 Stack

 Layer        Choice                                       Rationale

                                                           Clean module boundaries, DI,
 Backend      NestJS (TypeScript), modular monolith
                                                           easy to split later

                                                           Relational, JSONB for snapshots,
 DB           PostgreSQL 16 + Prisma
                                                           PostGIS for tiles

                                                           Retries, rate limiting, concurrency
 Queue        BullMQ on Redis
                                                           control, scheduling

                                                           Places response cache, dedupe,
 Cache        Redis
                                                           rate-limit counters

 Site                                                      Fast builds, zero-JS output, cheap
              Astro 4, static output
 generator                                                 hosting, trivially templatable

 Preview      Cloudflare R2 + Workers, or S3 +             Static, cheap, per-object headers
 hosting      CloudFront                                   for noindex

              React 18 + TypeScript + Vite + Tailwind +
 Admin UI                                                  Operator console
              shadcn/ui + TanStack Query/Table

 LLM          Anthropic API (Claude)                       Classification + copywriting

              Amazon SES with owned sending
 Email                                                     See §11
              domains, or Smartlead/Instantly API

 Payments     Stripe (Checkout + Billing for recurring)    Quote acceptance → subscription

                                                           Operator already has Railway
 Deploy       Railway (app, Postgres, Redis)
                                                           configured


DECISION : Railway vs. Fly.io vs. a small VPS. Railway is the default given existing access.


2.2 Module map (NestJS)

 src/
   modules/
      compliance/          # jurisdiction rules, suppression, consent gate, audit
      territory/           # geography definition, quadtree tiling, campaign budgets
      discovery/           # Google Places client, search orchestration, dedupe
      qualification/       # website-absence detection, lead scoring
      enrichment/          # email discovery + verification, provider adapters
      profiling/           # vertical classification, brand inference, content brief
      generator/           # Astro build orchestration, template selection
      preview/             # preview hosting, expiry, takedown
      quoting/             # pricing engine, proposal rendering
      outreach/            # sequences, sending, reply ingestion + classification
      crm/                 # lead pipeline states, notes, tasks
      conversion/          # Stripe, provisioning, handover
      billing/             # recurring services, invoicing
      ops/                 # cost ledger, quotas, kill switch, health
    workers/               # BullMQ processors, one file per queue
    shared/                # config, logging, errors, types



2.3 Queues

  Queue                    Concurrency      Rate limit              Notes

  discovery.tile           4                10/s                    Google QPS guard

  discovery.details        6                10/s

  enrichment.email         4                per-provider            Adapter-specific limits

  enrichment.verify        8                per-provider

  profiling.classify       4                20/min                  LLM

  generator.build          2                —                       CPU heavy

  preview.publish          4                —

                                            per-mailbox daily
  outreach.send            1 per mailbox                            Serialised per mailbox
                                            cap

  outreach.ingest          2                —                       IMAP/webhook poll

                                                                    Snapshot expiry,
  maintenance.purge        1                cron 03:00
                                                                    retention


All queues emit to the cost ledger. All are pausable individually from the admin UI. A global
kill switch ( ops.killswitch ) pauses every queue and blocks all sends.
3. Data model
Prisma schema, abbreviated to the meaningful parts.


 model Campaign {
     id               String      @id @default(cuid())
     name             String
     status           CampaignStatus     // draft|running|paused|complete|halted
     countryCode      String
     geometry         Json        // GeoJSON polygon, or {center,radiusM}
     includedTypes String[] // Google place types
     excludedTypes String[]
     budgetUsdCap     Decimal
     spendUsd         Decimal     @default(0)
     maxLeads         Int?
     createdAt        DateTime @default(now())
     tiles            Tile[]
     leads            Lead[]
 }


 model Tile {
     id             String      @id @default(cuid())
     campaignId     String
     parentId       String?
     bbox           Json        // [minLng,minLat,maxLng,maxLat]
     depth          Int
     status         TileStatus // pending|searching|saturated|done|failed
     resultCount Int            @default(0)
     campaign       Campaign @relation(fields:[campaignId], references:[id])
     @@index([campaignId, status])
 }


 // PERMANENT. place_id may be stored indefinitely.
 model PlaceRef {
     placeId        String      @id
     countryCode String
     firstSeenAt DateTime @default(now())
     lastSeenAt     DateTime
     leads          Lead[]
 }


 // EXPIRING. Raw Google content, purged after retention window.
 model PlaceSnapshot {
     id            String      @id @default(cuid())
     placeId       String
    raw           Json          // full Places response
    fetchedAt     DateTime @default(now())
    expiresAt     DateTime // fetchedAt + 30d
    @@index([placeId])
    @@index([expiresAt])
}


model Lead {
    id                   String      @id @default(cuid())
    campaignId           String
    placeId              String
    // Denormalised operational fields (our derived data, not raw Google cache)
    businessName         String
    vertical             String?
    countryCode          String
    city                 String?
    phone                String?
    websiteStatus        WebsiteStatus     // none|social_only|parked|broken|http_only|live
    websiteUrl           String?
    rating               Float?
    reviewCount          Int?
    score                Float?
    scoreBreakdown Json?
    stage                LeadStage         // discovered|qualified|enriched|profiled|generated|queued|co
    legalGate            LegalGate         // pending|clear|blocked
    legalGateReason String?
    contacts             Contact[]
    site                 GeneratedSite?
    quote                Quote?
    messages             OutreachMessage[]
    events               LeadEvent[]
    createdAt            DateTime @default(now())
    @@unique([campaignId, placeId])
    @@index([stage, score])
}


model Contact {
    id               String        @id @default(cuid())
    leadId           String
    email            String
    emailType        EmailType         // named|role_generic|catchall_guess
    source           String            // provider/adapter name
    sourceUrl        String?
    confidence       Float             // 0..1
    verification     VerifyState // unverified|valid|risky|invalid|catchall
    verifiedAt       DateTime?
    isPrimary        Boolean       @default(false)
    @@unique([leadId, email])
}


model GeneratedSite {
    id            String      @id @default(cuid())
    leadId        String      @unique
    templateId    String
    contentBrief Json
    copy          Json
    buildHash     String
    previewUrl    String?
    previewSlug   String      @unique
    expiresAt     DateTime
    takenDownAt   DateTime?
    views         Int         @default(0)
    lastViewedAt DateTime?
}


model Quote {
    id             String     @id @default(cuid())
    leadId         String     @unique
    currency       String
    buildFee       Decimal
    monthlyFee     Decimal
    tier           String     // starter|business|premium
    lineItems      Json
    validUntil     DateTime
    acceptedAt     DateTime?
    stripeSessionId String?
}


model OutreachMessage {
    id            String      @id @default(cuid())
    leadId        String
    contactId     String
    sequenceStep Int
    mailboxId     String
    subject       String
    bodyHtml      String
    bodyText      String
    status        MsgStatus // queued|sent|delivered|opened|clicked|bounced|complained|failed|bl
    providerId    String?
    sentAt        DateTime?
    @@index([leadId, sequenceStep])
}


model Reply {
    id              String         @id @default(cuid())
    leadId          String
    messageId       String?
    fromEmail       String
    receivedAt      DateTime
    raw             String
    intent          ReplyIntent // interested|not_interested|unsubscribe|out_of_office|wrong_perso
    confidence      Float
    handled         Boolean @default(false)
}


model Suppression {
    id             String         @id @default(cuid())
    emailHash      String?        @unique
    placeId        String?        @unique
    domain         String?
    reason         String
    createdAt      DateTime @default(now())
}


model Mailbox {
    id                  String     @id @default(cuid())
    address             String     @unique
    sendingDomain String
    dailyCap            Int
    sentToday           Int        @default(0)
    warmupStage         Int        @default(0)
    reputation          Json       // bounce rate, complaint rate rolling 7d/30d
    status              String     // warming|active|paused|burned
}


model CostEvent {
    id            String         @id @default(cuid())
    campaignId String?
    category      String         // places_search|places_details|llm|email_verify|enrichment|send
    units         Int
    usd           Decimal
    createdAt     DateTime @default(now())
    @@index([campaignId, category])
}


model LeadEvent {
    id           String        @id @default(cuid())
    leadId       String
    type         String
    payload      Json
    createdAt DateTime @default(now())
     @@index([leadId, createdAt])
 }


Enable PostGIS if tile geometry work grows beyond bounding boxes. Bounding boxes in
JSONB are sufficient for v1.




4. Pipeline overview

 Territory → Discovery → Qualification → Legal gate → Enrichment → Profiling
      → Generation → Preview publish → Quote → Outreach → Reply handling
      → Conversion → Provisioning → Recurring billing


Each stage is idempotent and re-runnable. A lead's stage field is advanced only on
success. Any stage may push the lead to suppressed , which is terminal.




5. Stage 1 — Territory and tiling

5.1 Campaign input
The operator defines a campaign as one of:

     A country + city list

     A drawn polygon on a map (GeoJSON)

     A point + radius

     A bounding box

Plus: included place types, excluded place types, budget cap in USD, optional max lead
count.


5.2 Recursive quadtree tiling
Nearby/Text Search returns at most 20 results per request and at most 60 with pagination.
Exhaustive coverage therefore requires subdivision.


 enqueue(rootTile)


 processTile(tile):
     for each includedType T:
         results = placesSearchNearby(tile.center, tile.radius, type=T, maxResultCount=20)
         if results.length >= 20 and tile.depth < MAX_DEPTH:
           mark tile saturated
           create 4 child tiles (quadrants), enqueue each
           return
         upsert results as PlaceRef + Lead(discovered)
    mark tile done


    MAX_DEPTH default 8. Below roughly 100m radius, stop and accept incompleteness; log
   it.

   Skip tiles whose bbox has no land or no populated area if a population raster is available.
   Optional optimisation, not v1.

   Circle inscribed in the tile bbox leaves corner gaps. Compensate by using a
   circumscribing radius ( radius = halfDiagonal ) and accepting overlap. Dedupe by
    place_id handles the duplicates.

   Track spendUsd per campaign after every request. When spendUsd >= budgetUsdCap *
   0.9 , warn; at 100%, pause the campaign and notify.


5.3 High-value place types
Ship a curated seed list, weighted by likely willingness to pay and likelihood of lacking a
website:

 Tier A (high value, high gap): dentist, lawyer, physiotherapist, veterinary_care,
    real_estate_agency, accounting, insurance_agency, plumber, electrician,
    roofing_contractor, general_contractor, moving_company, car_repair
 Tier B: restaurant, cafe, bakery, bar, hair_care, beauty_salon, spa, gym,
    pet_store, florist, jewelry_store, furniture_store, tailor
 Tier C: clothing_store, hardware_store, book_store, laundry, shoe_store


Types map to template families in §9.




6. Stage 2 — Discovery and qualification

6.1 Places client
Wrap the Places API (New) with:

   Field masks tuned per call to control SKU cost. Search calls request only id,
   displayName, formattedAddress, location, primaryType, websiteUri,
   businessStatus, rating, userRatingCount . Details calls (only for qualified leads)
   additionally request nationalPhoneNumber, internationalPhoneNumber,
   regularOpeningHours, priceLevel, editorialSummary, reviews, photos .

   Exponential backoff on 429/5xx, max 5 attempts.

   Response cached in Redis keyed by request hash, TTL 24h, to make re-runs free.

   Every call writes a CostEvent .


6.2 Website-absence detection
websiteUri absent is the strong signal, but not the only one. Classify:


  websiteStatus       Condition                                                Lead value

  none                No websiteUri                                            Highest

                      URI host in {facebook, instagram, linktr.ee, wa.me,
  social_only                                                                  High
                      tiktok, linkedin, yelp, tripadvisor, google sites}

                      Resolves but page matches parking-page heuristics
  parked              (registrar boilerplate, "coming soon", "under            High
                      construction", <500 bytes body)

                      DNS failure, connection refused, 4xx/5xx on 2 attempts
  broken                                                                       High
                      60s apart

  http_only           Serves over HTTP, no HTTPS redirect                      Medium

                                                                               Excluded
                                                                               from
  live                Everything else
                                                                               campaign by
                                                                               default


Probing is a HEAD then GET with a 8s timeout, a clearly identified user agent ( Sitewright-
Probe/1.0 (+https://{agency}/bot) ), honouring robots.txt , at most 2 requests per host
per day. Never crawl beyond the root URL.

DECISION : whether to include http_only and live-but-terrible sites (no mobile
viewport, no SSL, very slow). This roughly triples addressable volume but changes the pitch
from "you have no website" to "your website needs replacing". Default v1: exclude, keep the
detector in place behind a flag.


6.3 Lead scoring
 score = 0.30 * contactability
          + 0.25 * revenueProxy
          + 0.20 * digitalGap
          + 0.15 * qualitySignal
          + 0.10 * competitivePressure


     contactability : 1.0 named verified email, 0.75 role-generic verified ( info@ ,
     contact@ ), 0.4 unverified, 0.15 phone only, 0 nothing.

     revenueProxy : normalised blend of category value tier (A=1.0, B=0.6, C=0.35),
     priceLevel where present, and log-scaled userRatingCount .

     digitalGap : none=1.0, broken=0.9, parked=0.85, social_only=0.75, http_only=0.4.

     qualitySignal : rewards a business that is alive and cared about. rating >= 4.0 &&
     userRatingCount >= 20 → 1.0; sliding down to 0 for rating < 3.0 or userRatingCount
     < 3 . businessStatus != OPERATIONAL → hard exclude, not a score penalty.

     competitivePressure : share of same-type businesses within the same tile that do have
     a live website. Higher share = stronger pitch. This gives the outreach copy a genuine,
     verifiable hook.

Store the full breakdown in scoreBreakdown so the UI can explain the ranking.


6.4 Enrichment — email discovery
Run adapters in cost order, stopping at first verified hit. Each adapter implements:


 interface EnrichmentAdapter {
     name: string;
     costPerLookupUsd: number;
     supports(lead: Lead): boolean;
     find(lead: Lead): Promise<ContactCandidate[]>;
 }


Adapters, in recommended order:

1. social-profile — if websiteStatus === 'social_only' , the linked profile often
     exposes a public business email. Use official APIs where they exist. Do not scrape Meta
     properties; this breaches their terms and the account risk is real. If no official route is
     available for a platform, mark the adapter unavailable rather than scraping. DECISION for
     the operator.

2. registry — national company/business registries. Many publish a registered contact
   address. Malta MBR, UK Companies House API (free, good coverage), Ireland CRO, and
   equivalents. Highest legitimacy, best for EU defensibility because the source is
   disclosable under Art. 14.

3. directory — licensed directory aggregators and national yellow-pages equivalents with
   terms permitting commercial use. Check each one's terms individually and record the
   licence in the adapter metadata.

4. data-provider — commercial B2B providers (Apollo, Cognism, Lusha, Hunter). Note
   that most are domain-keyed and therefore near-useless for businesses with no domain.
   Their value here is name+location+phone reverse lookup, which only some support.
   Evaluate hit rate before committing to a contract.

5. pattern-guess — only where a domain exists (parked/broken cases). Generate info@ ,
    contact@ , hello@ , {firstname}@ , verify each, keep only valid . Never send to an
   unverified guess.

Record source and sourceUrl on every contact. The Art. 14 notice quotes this field
verbatim. If you cannot name the source, you cannot legally send. Enforce this in the
compliance gate.

Fallback channels. For the 70–90% with no email, capture them into a phone_outreach or
postal_outreach bucket with the same generated preview and a short URL, so the
operator can work them manually or via a call script. Do not discard them.


6.5 Email verification
   Syntax + disposable-domain check (local).

   MX record lookup (local, free).

   Provider verification (ZeroBounce/NeverBounce/Bouncer) for anything reaching send.

   Result catchall counts as risky : allowed only at low volume and only from a warmed
   mailbox with headroom. Never in the first 30 days of a domain.

   Hard rule: a lead may only enter the outreach queue with at least one contact at
    verification === 'valid' . Bounce rate must be kept under 2%.




7. Stage 3 — Profiling
Produces the contentBrief that drives generation.

Inputs: Places details (name, types, address, hours, phone, price level, editorial summary,
review text), competitive context from the tile, country/language.

Two LLM calls:

7.1 Classification — deterministic, low temperature, JSON only.

 System: You classify small businesses for website generation. Respond with JSON only,
 no prose, no markdown fences.


 User:
 Business: {name}
 Google types: {types}
 Address: {address}
 Editorial summary: {summary}
 Review excerpts: {up to 5 reviews, truncated to 200 chars each}


 Return:
 {
     "vertical": "<one of: restaurant|cafe|bar|bakery|salon|spa|gym|dental|medical|
                    veterinary|legal|accounting|realestate|trades|automotive|retail|
                    education|events|hospitality|professional_services|other>",
     "subVertical": "<free text, 1-4 words>",
     "servicesOffered": ["..."],           // max 8, inferred, only if well-supported
     "differentiators": ["..."],           // max 4, drawn from review themes
     "toneOfVoice": "<warm|professional|premium|energetic|traditional|clinical>",
     "primaryCTA": "<call|book|visit|quote|order|enquire>",
     "languageCode": "<BCP-47>",
     "confidence": 0.0-1.0,
     "insufficientData": true|false
 }


If confidence < 0.6 or insufficientData , route to a manual review queue instead of
generating. Do not send a mockup built on guesswork; a wrong-vertical mockup is worse
than no email.

7.2 Copywriting — produces the page copy. See §9.3.

Language: generate in the country's dominant business language by default, with the
operator able to override per campaign. For Malta, English. For Nigeria, English. Multilingual
output is a premium add-on in the quote, not a default.




8. Stage 4 — Legal gate
Runs after enrichment, before generation, and again immediately before every send.
 gate(lead):
      policy = jurisdiction(lead.countryCode)
      if !policy                              → blocked("no policy for country")
      if policy.priorConsentRequired          → blocked("prior consent jurisdiction")
      if suppressed(lead)                     → blocked("suppressed")
      if !lead.primaryContact                 → blocked("no contact")
      if contact.verification != valid → blocked("unverified")
      if !contact.source                      → blocked("undisclosable source")
      if policy.soleTraderTreatedAsIndividual && looksLikeSoleTrader(lead)
                                              → blocked("individual subscriber")
      → clear


looksLikeSoleTrader heuristic: business name matches a personal-name pattern with no
corporate suffix (Ltd, Limited, GmbH, SRL, BV, plc, Inc, LLC), and review count below a
threshold. Conservative. When uncertain, block. Surface blocked leads in the UI with the
reason so the operator can override individually with a written justification, which is logged.




9. Stage 5 — Website generation

9.1 Approach
Astro project with a template library. Generation = select template + inject content brief +
build + upload static output. Build must complete in under 20 seconds per site; parallelism
2.


9.2 Template families
Ship 6 at launch, each with 3 colour schemes and 2 typographic pairings:


     Template        Verticals                    Sections

                     restaurant, cafe, bar,       Hero, menu highlights, gallery, hours+map,
     hospitality
                     bakery                       reservations CTA, reviews

                     salon, spa, dental,          Hero, services + indicative pricing, team,
     appointment
                     medical, veterinary          booking CTA, hours+map, reviews

                     plumber, electrician,        Hero with phone CTA, services grid, service
     trades
                     contractor, automotive       area map, "why us", quote form, reviews

                     legal, accounting,           Hero, practice areas, credentials, case-style
     professional
                     realestate, consulting       proof, contact form
                                                Hero, categories, featured products, store info,
  retail             shops, boutiques
                                                hours+map

                                                Hero, classes/timetable, membership tiers,
  fitness            gym, studio, coach
                                                trial CTA, gallery


Every template ships with: responsive layout, Lighthouse ≥95 on all four axes,
LocalBusiness JSON-LD schema, Open Graph tags, WCAG AA contrast, click-to-call,
embedded map, and a working contact form (posts to our endpoint, forwards to the
business only after conversion; before conversion it captures to our DB and the preview
shows a "this is a mockup" confirmation).


9.3 Copy generation prompt

 System: You write website copy for small local businesses. Write in {languageCode}.
 Tone: {toneOfVoice}. Never invent facts. Never state prices, awards, years in business,
 certifications, staff names, or claims not present in the input. Where a section needs
 detail you do not have, write copy that works without it. Output JSON only.


 User: {contentBrief}


 Return:
 {
     "meta": { "title": "<=60 chars", "description": "<=155 chars" },
     "hero": { "headline": "<=8 words", "subhead": "<=20 words", "ctaLabel": "<=3 words" },
     "about": { "heading": "", "body": "60-90 words" },
     "services": [ { "name": "", "description": "18-30 words" } ],             // 3-6 items
     "whyUs": [ { "title": "<=4 words", "body": "<=25 words" } ],              // 3 items
     "cta": { "heading": "", "body": "<=25 words", "buttonLabel": "" },
     "placeholdersUsed": ["..."]         // any element the business must supply
 }


Hallucination guard. Post-process every string against a deny-list of unverifiable claim
patterns: numerals followed by "years", "award", "certified", "licensed", "voted", "number
one", "best in", "since 19xx/20xx", "family-run" (unless present in source), specific prices,
staff names not in source. Any hit → regenerate that field once with the violation named;
second failure → substitute a neutral fallback string and add the field to placeholdersUsed .
Log every violation for prompt tuning.


9.4 Imagery
1. Vertical-matched licensed stock via Unsplash/Pexels API, deterministic selection seeded
     on place_id so rebuilds are stable.
2. Optional AI-generated hero for premium verticals.

3. All images carry data-placeholder="true" and the page footer states images are
   indicative.

4. Logo: generate a clean wordmark from the business name using the template's display
   typeface. Never fabricate an emblem that could be mistaken for a real trademark.


9.5 Build and publish
   Build in an isolated worker directory, deterministic output, hash the result into
    buildHash .

   Upload to object storage under previews/{slug}/ .

    slug = 22-char nanoid. Not guessable, not sequential, not derived from the business
   name.

   Headers on every object: X-Robots-Tag: noindex, nofollow, noarchive , Cache-
   Control: public, max-age=300 .

    robots.txt at the preview host root: User-agent: * / Disallow: / .

   Preview host is a separate domain from both the agency site and the sending domains.
   Reputation isolation.

   Expiry worker returns 410 Gone with a short "this mockup has expired" page after
    expiresAt .

   Takedown endpoint hard-deletes objects, sets takenDownAt , writes suppression, and
   returns a confirmation page.


9.6 View tracking
Track preview opens (server-side, on the HTML request, deduped by IP+UA hash within 30
min). A viewed preview is the single strongest buying signal in the pipeline. It should
immediately: raise lead priority, notify the operator, and if configured, trigger the next
sequence step early.




10. Stage 6 — Quoting

10.1 Pricing model

 interface PricingConfig {
      currency: string;
      tiers: {
           starter:     { buildFee: number; monthly: number; pages: number; revisions: number };
           business: { buildFee: number; monthly: number; pages: number; revisions: number };
           premium:     { buildFee: number; monthly: number; pages: number; revisions: number };
      };
      addOns: {
           contentManagement: { monthly: number; updatesIncluded: number };
           maintenance:          { monthly: number };     // uptime, backups, patches, SSL
           seoLocal:             { setup: number; monthly: number };
           copywritingExtra:     { perPage: number };
           ecommerce:            { setup: number; monthly: number };
           multilingual:         { perLanguage: number; monthly: number };
           domainAndEmail:       { setup: number; monthly: number };
           photography:          { oneOff: number };
      };
      countryMultipliers: Record<string, number>;           // purchasing-power adjustment
  }


Tier selection rule: driven by revenueProxy and vertical. Tier A verticals with reviewCount
> 50 → premium. Tier C with low review counts → starter. Never quote premium to a lead
scoring in the bottom quartile; it kills reply rates.

Country multipliers matter. The same quote in EUR is unserious in Lagos and underpriced
in Zurich. Ship multipliers and always present in local currency.

DECISION : the operator must supply actual price points. Placeholder defaults for the build:

      Starter: €690 build / €49 month (5 pages, hosting + maintenance)

      Business: €1,450 build / €99 month (10 pages, + content management, 2 updates/mo)

      Premium: €2,900 build / €189 month (unlimited pages, + local SEO, 4 updates/mo,
      priority support)


10.2 Proposal page
A quote is not a PDF attachment; attachments hurt deliverability. It is a hosted page at
quote.{domain}/{slug} containing:

      Side-by-side preview embed

      What's included, per tier, with the recommended tier pre-highlighted

      Transparent monthly breakdown

      Timeline (typically 7–10 working days from brief)
      Validity date

      Two buttons: "Accept and start" (→ Stripe Checkout) and "Talk to us first" (→ booking
      link)

      A third, quieter link: "Not interested, remove my details" (→ suppression + takedown)

Include that third link. It converts hostile replies into silent opt-outs and materially reduces
complaint rates.




11. Stage 7 — Outreach infrastructure

11.1 Domain and mailbox setup
      Sending domains are separate from the agency's primary domain and from the preview
      host. Register 2–4 lookalike domains ( get{agency}.com , {agency}-studio.com ).

      Each sending domain: SPF, DKIM (2048-bit), DMARC starting at p=none; rua=... and
      moving to p=quarantine after 30 clean days. Custom return-path. Reverse DNS if self-
      hosting.

      2–3 mailboxes per domain. Never more.

      MTA-STS and TLS-RPT are cheap credibility wins; add them.


11.2 Warmup schedule (per mailbox)

  Week            Daily cap         Notes

  1               5                 Warmup network + internal replies only

  2               10                Begin 20% real leads

  3               20                50% real

  4               30                80% real

  5               40                Full

  6+              50                Ceiling. Do not exceed 50/mailbox/day.


Total capacity with 4 domains × 3 mailboxes × 50 = 600/day at full ramp. Design the UI to
make this ceiling obvious, because the instinct to raise it is what destroys these systems.
11.3 Reputation guardrails
Computed rolling over 7 and 30 days per mailbox and per domain:

     Hard bounce rate > 3% → pause mailbox, alert.

     Complaint rate > 0.1% → pause mailbox immediately, alert.

     Complaint rate > 0.3% on a domain → mark domain burned , stop all its mailboxes
     permanently.

     Reply rate < 1% after 200 sends → pause and force copy review. Low reply rate usually
     means the targeting or copy is wrong, and continuing damages reputation for nothing.

Monitor Google Postmaster Tools and SES reputation metrics; surface both in the ops
dashboard.


11.4 Provider
DECISION : Amazon SES (cheapest, full control, you own reputation management and must
handle warmup yourself) vs. Smartlead/Instantly (handles rotation, warmup networks, inbox
placement, but monthly cost and less control). Recommendation: SES for v1 with a provider-
adapter interface so switching is a config change.

Do not use Postmark. Their terms prohibit cold outreach and they enforce it.


11.5 Sequence

 Step      Delay    Content                                                Notes

                    Personalised opener + preview link +                   Plain text, no images,
 1         0
                    compliance block                                       no tracking pixel

           +4       Short nudge referencing one concrete thing
 2                                                                         Only if no reply
           days     about their business

           +8       Quote link, framed as "here's what it would cost,
 3                                                                         Only if no reply
           days     no obligation"

           +14      One-line close-out: "I'll take you off the list, the   Final. Always honour
 4
           days     mockup comes down on {date}"                           it.


Maximum 4 touches, ever. Then permanent suppression regardless of outcome. Any reply
of any kind stops the sequence immediately.

If the preview is viewed but no reply: insert a bridge step within 24 hours referencing the
specific view. This is the highest-converting message in the sequence.


11.6 Email construction rules
   Plain text or minimal HTML. No image headers, no marketing template chrome, no CSS-
   heavy layouts. These trip spam filters and read as bulk.

   No open-tracking pixel in step 1. It hurts placement and the preview-view event gives
   better signal anyway.

   Link tracking: use the sending domain's own subdomain for redirects. Never a shared
   shortener.

   Subject lines: lowercase, 3–6 words, specific, no punctuation gimmicks. Avoid "free",
   "guarantee", "!", "$", all-caps.

   Personalisation must be real. "I noticed you're the only dentist in {area} without a
   website" is verifiable from our own data and is the reason this system has an edge over
   generic spam. Generate the opener from scoreBreakdown.competitivePressure and
    qualitySignal , not from an LLM's imagination.

   Send timing: 08:00–11:00 and 14:00–16:00 local time to the recipient, Tue–Thu. No
   weekends. Randomise by ±20 minutes.

   Randomise inter-send delay 90–400 seconds per mailbox.


11.7 Reply ingestion and classification
   IMAP poll every 2 minutes, or provider webhook.

   Thread matching via In-Reply-To / References , falling back to From address +
   recent-send lookup.

   Classify with an LLM into the ReplyIntent enum, low temperature, plus a rules layer
   that runs first: any message containing unsubscribe language, legal threat keywords
   ("GDPR", "solicitor", "lawyer", "report", "complaint", "cease"), or an ICO/DPA reference
   bypasses the LLM and routes straight to hostile / unsubscribe .

    hostile → immediate suppression, immediate preview takedown, operator alert, no
   automated response ever.

    unsubscribe → suppression, takedown, single plain confirmation.

    out_of_office → reschedule sequence +7 days, do not count as a touch.

    interested / question → stop sequence, alert operator, draft a suggested reply but
   never auto-send. A human sends every substantive reply.
12. Stage 8 — Conversion and delivery

12.1 Acceptance
Quote accepted → Stripe Checkout (one-off build fee + subscription for monthly services)
→ webhook → lead moves to won → provisioning job.


12.2 Provisioning checklist (semi-automated, human-confirmed)
1. Onboarding form to client: real copy, real photos, logo files, opening hours, service list,
   social links, domain preference.

2. Domain registration or transfer via registrar API. DECISION : registrar choice.

3. Promote generated site from preview to production project; remove all placeholder
   markers and the mockup banner.

4. Attach CMS. Recommendation: Astro + a Git-backed CMS (Decap) for starter tier,
   Payload CMS for business/premium where the client needs richer editing. Client gets a
   login and a two-page written guide.

5. Business email setup if purchased.

6. Google Business Profile linkage, analytics (Plausible or GA4), Search Console
   verification, sitemap submission.

7. Uptime monitoring registration.

8. Handover call and written summary.


12.3 Recurring services — define what is actually being sold
Vague monthly fees cause churn and disputes. Encode explicit SLAs:

   Hosting + maintenance: 99.9% uptime target, daily backups retained 30 days,
   dependency and security patching monthly, SSL renewal, uptime alerting, quarterly
   performance report.

   Content management: N content updates per month (tier-dependent), 2 business day
   turnaround, unused updates do not roll over, defined as text/image/page changes not
   redesigns.

   Local SEO: GBP optimisation, citation consistency, monthly ranking report on an agreed
   keyword set.

Track update requests against the tier allowance in the CRM so overages are visible and
billable.




13. Admin console (React)

13.1 Screens
 1. Dashboard — campaigns running, leads by stage funnel, sends today vs. cap, mailbox
    health, spend vs. budget, reply queue count, alerts.

 2. Campaigns — create (map draw, type picker, budget), monitor tile progress,
    pause/resume, cost breakdown.

 3. Leads — virtualised table, filter by stage/score/country/vertical/website status, bulk
    actions. Detail drawer: Places data, score breakdown with explanation, contacts +
    verification state, generated preview iframe, quote, message history, event timeline,
    manual override controls.

 4. Review queue — low-confidence classifications and legal-gate blocks needing a human
    decision. Approve/reject/edit.

 5. Generator — template library, preview any template with sample data, edit copy of a
    specific generated site and rebuild.

 6. Outreach — sequence editor, mailbox management, warmup status, reputation charts,
    send schedule, per-mailbox pause.

 7. Inbox — replies with intent classification, suggested draft, one-click send (human-
    confirmed), suppression actions.

 8. Pricing — tier and add-on configuration, country multipliers.

 9. Compliance — jurisdiction policy editor, suppression list (view/search/add only), audit
    log viewer, retention job status.

10. Ops — cost ledger by category and campaign, queue depths, kill switch, API quota
    usage.


13.2 UI conventions
    Every automated decision must be explainable in the UI. Score → breakdown. Gate block
    → reason. Classification → confidence and inputs.

    Destructive and irreversible actions (suppress, send, campaign start) require explicit
    confirmation showing the blast radius.
   The kill switch is always visible in the top bar.




14. Observability and cost control
   Structured JSON logs, correlation ID per lead threaded through every stage.

    CostEvent written for every billable external call. Dashboard shows cost per lead, cost
   per contacted lead, cost per reply, cost per won deal. These four numbers determine
   whether the business works.

   Hard quota guards: daily caps per external API, enforced in the client wrapper, not just
   monitored.

   Alerts (email + optional Slack): budget 90%, mailbox paused, domain burned, hostile
   reply, queue depth > threshold, error rate spike, LLM spend anomaly.

   Health endpoint reporting DB, Redis, queue depths, external API reachability.




15. Build phases
Deliver in this order. Each phase must be demoable and tested before the next begins.

M0 — Foundations. Repo, NestJS scaffold, Prisma schema, migrations, Docker compose
(Postgres + Redis), BullMQ wiring, config module, structured logging, health endpoint, CI.

M1 — Compliance module. Jurisdiction policy table + seed data, suppression store, gate
service, audit log. Unit tests covering every gate branch. Build this before anything that
could send.

M2 — Territory + discovery. Places client with field masks and cost events, quadtree tiler,
campaign CRUD, dedupe, website-status probe, scoring. CLI command to run a campaign
end to end and print results. Test on one small city.

M3 — Enrichment. Adapter interface, registry adapter (Companies House is the easiest
first real one), pattern-guess adapter, verification provider, contact storage. Measure and
report actual hit rate before proceeding.

M4 — Profiling. Classification prompt, confidence routing, manual review queue.

M5 — Generator. Astro template repo with two templates, copy generation, hallucination
guard, build worker, deterministic output.

M6 — Preview hosting. Object storage upload, slug routing, noindex enforcement, expiry,
takedown endpoint, view tracking.

M7 — Quoting. Pricing engine, tier selection, hosted proposal page, Stripe Checkout wiring.

M8 — Outreach. Provider adapter, mailbox model, warmup enforcement, sequence engine,
send scheduler, reputation guards, reply ingestion and classification. Send the first 20 by
hand-approval only.

M9 — Admin console. All screens.

M10 — Conversion + billing. Stripe subscriptions, provisioning checklist workflow, CMS
attachment, SLA tracking.

M11 — Hardening. Load test the queues, chaos-test external API failures, complete
retention jobs, penetration-check the public endpoints (preview, quote, unsubscribe,
takedown — all unauthenticated and internet-facing), finalise DMARC policy.




16. Repo structure

 sitewright/
    apps/
      api/                       # NestJS
      admin/                     # React + Vite
      templates/                 # Astro template workspace
        src/templates/hospitality/
        src/templates/appointment/
        src/templates/trades/
        src/templates/professional/
        src/templates/retail/
        src/templates/fitness/
    packages/
      shared-types/
      places-client/
      email-adapters/
      enrichment-adapters/
    prisma/
      schema.prisma
      migrations/
      seed/jurisdictions.ts
    docker-compose.yml
    .env.example
    README.md


Monorepo via pnpm workspaces + Turborepo.
17. Environment variables

 # Core
 DATABASE_URL=
 REDIS_URL=
 APP_BASE_URL=
 NODE_ENV=


 # Google
 GOOGLE_MAPS_API_KEY=
 GOOGLE_PLACES_DAILY_REQUEST_CAP=


 # Anthropic
 ANTHROPIC_API_KEY=
 LLM_MODEL=
 LLM_DAILY_USD_CAP=


 # Storage
 S3_ENDPOINT=
 S3_BUCKET_PREVIEWS=
 S3_ACCESS_KEY_ID=
 S3_SECRET_ACCESS_KEY=
 PREVIEW_HOST=              # separate domain
 QUOTE_HOST=


 # Email
 EMAIL_PROVIDER=ses|smartlead
 AWS_SES_REGION=
 AWS_ACCESS_KEY_ID=
 AWS_SECRET_ACCESS_KEY=
 IMAP_HOST= IMAP_USER= IMAP_PASS=


 # Enrichment
 COMPANIES_HOUSE_API_KEY=
 EMAIL_VERIFY_PROVIDER=
 EMAIL_VERIFY_API_KEY=


 # Payments
 STRIPE_SECRET_KEY=
 STRIPE_WEBHOOK_SECRET=


 # Images
 UNSPLASH_ACCESS_KEY=


 # Legal identity (injected into every email footer)
 LEGAL_ENTITY_NAME=
 LEGAL_ENTITY_REG_NO=
 LEGAL_ENTITY_ADDRESS=
 PRIVACY_POLICY_URL=
 DPO_EMAIL=


 # Safety
 KILL_SWITCH=false
 MAX_SENDS_PER_DAY_GLOBAL=




18. Testing
   Unit: scoring function against fixture leads with expected ranks; compliance gate
   against every branch; hallucination guard against a corpus of known-bad generated
   strings; tiling algorithm against synthetic saturated tiles.

   Integration: full pipeline against a mocked Places API returning a fixture city; verify no
   send occurs without a valid contact and a clear gate.

   Contract: record/replay fixtures for every external API so tests never hit live services.

   E2E: Playwright over the admin console covering campaign creation → lead review →
   preview generation → quote → approve send.

   Safety tests, non-negotiable: assert that a suppressed lead cannot receive a message
   through any code path; assert previews carry noindex headers; assert unsubscribe
   writes suppression synchronously before returning 200; assert daily caps cannot be
   exceeded by concurrent workers (test with 50 parallel jobs).




19. Decisions needed from the operator before M3
1. Target countries for phase one, and confirmation of the legal position in each (ideally
   reviewed by counsel, given the EU exposure).

2. Legal entity details for the email footer and the privacy notice URL.

3. Actual pricing per tier and per add-on, and target currencies.

4. Whether to include http_only / poor-quality existing sites in scope.

5. Email provider: SES vs. managed cold-email platform.

6. Which enrichment providers to contract, after the M3 hit-rate measurement.
 7. Registrar for domain provisioning.

 8. Whether social-profile enrichment is used at all, given platform terms.

 9. Monthly budget ceiling for Places API and LLM spend.

10. Whether the reply-handling step ever auto-sends, or always requires a human. Default
    in this spec: always human.




20. Guardrails Claude Code must not relax
These exist because the failure modes are severe and hard to reverse.

 1. Never send to an unverified email address.

 2. Never send to a suppressed address, place, or domain.

 3. Never exceed 50 sends per mailbox per day.

 4. Never send more than 4 messages to one business, ever.

 5. Never auto-send a reply to a human reply.

 6. Never scrape Google Maps or any platform whose terms forbid it.

 7. Never publish a preview without noindex headers and the mockup banner.

 8. Never cache Google Places content beyond the retention window.

 9. Never generate copy containing unverifiable claims about the business.

10. Never proceed in a jurisdiction with no policy record. Fail closed.

If a requirement in a future instruction conflicts with one of these, stop and ask rather than
complying.
