# Sitewright

Find businesses that have a Google Business Profile but no real website, enrich them with a
contact email, generate a tailored concept-mockup website, and send a compliant outreach email
containing that preview plus a priced quote. Built against `docs/SPEC.md`.

**Status:** all build phases M0–M11 implemented and tested. Decisions the spec left to the operator
are listed with the defaults taken in `docs/DECISIONS.md`; read it before go-live.

## Layout

```
apps/
  api/        NestJS modular monolith (compliance, territory, discovery, qualification, enrichment,
              profiling, generator, preview, quoting, outreach, crm, conversion, billing, ops) + workers
  admin/      React 19 + Vite + Tailwind operator console (10 screens)
  templates/  Astro template workspace: 10 families (one design per kind of business) × 6 palettes × 5 type pairings
packages/
  shared-types/          enums, zod schemas, queue registry, design tokens (palettes, type pairings)
  places-client/         Google Places API (New) client: field masks, backoff, cache, cost hooks
  enrichment-adapters/   registry / directory / data-provider / pattern-guess adapters + verifiers
  email-adapters/        SES, Smartlead, fake providers; IMAP inbound; reply-text extraction
prisma/                  schema, migrations, seed (jurisdictions, pricing, sequence)
docs/                    SPEC.md, API.md (admin/public API contract), PACKAGES.md, DECISIONS.md
```

## Quick start

```bash
cp .env.example .env            # fill in LEGAL_* and the API keys you have
docker compose up -d            # Postgres 16, Redis 7, MinIO (optional S3-compatible storage)
pnpm install
pnpm db:migrate                 # applies prisma/migrations
pnpm db:seed                    # 22 jurisdiction policies, placeholder pricing, 4-step sequence
pnpm build                      # packages, templates, api, admin
pnpm api                        # http://localhost:3000  (workers run in-process; WORKERS=off to disable)
pnpm admin                      # http://localhost:5173  (paste ADMIN_API_TOKEN once)
```

Run discovery + qualification for one small city from the CLI and print the results:

```bash
pnpm cli run-campaign docs/examples/campaign-valletta.json
```

Other CLI commands: `pnpm cli health`, `pnpm cli retention:run`.

## Pipeline

```
Territory → Discovery → Qualification → Enrichment → Legal gate → Profiling → Generation
   → Preview publish → Quote → Outreach → Reply handling → Conversion → Provisioning → Billing
```

Every stage is a BullMQ job (one processor per queue in `apps/api/src/workers`), idempotent and
re-runnable from the Leads screen. The legal gate runs after enrichment, before generation, and
again immediately before every send. `ops.killswitch` pauses every queue and blocks all sends.

Generation picks the template family for the lead's kind of business (ten families, each a different
site design; see `apps/templates/docs/FAMILIES.md`), the palette (fixed schemes or ones derived from the
lead's own listing photos) and a type pairing. The console's **design studio** (`/leads/:id/studio`)
shows the real page for the lead inside a frame with those controls plus a device toggle; "Apply &
republish" rebuilds it at the same preview URL.

Every outreach email and proposal links to a hosted booking page where the lead picks a free slot
(your weekly hours from the **Scheduling** screen, minus bookings and anything busy in a private
iCal feed). Booking emails a confirmation with a calendar invite, opens a CRM task, stops the
sequence and queues reminders, including a forced one-click confirmation the day before. The
mockups' own "book" buttons open a themed booking page that simulates the business's calendar
from its listed opening hours. Bookings appear under **Meetings**.

## Testing

```bash
pnpm test                       # all workspaces
pnpm --filter @sitewright/api test          # jest: unit + integration against local Postgres/Redis
pnpm --filter @sitewright/templates test    # vitest: builds every template family, checks determinism
pnpm --filter @sitewright/admin test        # vitest + testing-library
```

The API integration tests use `TEST_DATABASE_URL` (default `sitewright_test`) and apply the committed
migrations; they never reach external services (fake Places, LLM, email provider, payment gateway).
Safety invariants covered by tests: suppressed leads cannot be sent to through any path, previews
carry noindex headers and the mockup banner, unsubscribe writes suppression before returning 200,
60 concurrent reservations on a 50/day mailbox yield exactly 50, the first 20 sends need hand
approval, replies are never auto-answered.

## Configuration

See `.env.example`. Required: `DATABASE_URL`, `REDIS_URL`, `ADMIN_API_TOKEN`, and the legal
identity block (`LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_REG_NO`, `LEGAL_ENTITY_ADDRESS`,
`PRIVACY_POLICY_URL`, `DPO_EMAIL`, `AGENCY_NAME`, `AGENCY_URL`). Without API keys the system runs
with fake providers (LLM, email, payments, verification) so every screen and flow can be exercised.

Public, internet-facing endpoints (unauthenticated): `/p/:slug` previews, `/q/:slug` proposals,
`/u/:token` unsubscribe, `/takedown/:token`, `/t/:token` click tracking, `/webhooks/stripe`,
`/webhooks/email`, `/robots.txt`, `/health`. In production put previews on a separate domain
(`PREVIEW_HOST`) and tracking on a subdomain of the sending domain (`TRACKING_HOST`).

## Deploy (Railway)

One Docker service built from the root `Dockerfile` runs the API, the BullMQ workers and serves the
operator console (`apps/admin/dist`) at `/`. `scripts/railway-start.sh` applies migrations, runs the
idempotent base seed, optionally loads demo data (`DEMO_SEED=true`, only into an empty database) and
starts the server. Required Railway resources in the same project:

- Postgres (`DATABASE_URL=${{Postgres.DATABASE_URL}}`)
- Redis (`REDIS_URL=${{Redis.REDIS_URL}}`)
- a Bucket for previews (`STORAGE_DRIVER=s3`, `S3_ENDPOINT=${{previews.ENDPOINT}}`, `S3_BUCKET_PREVIEWS=${{previews.BUCKET}}`,
  `S3_REGION=${{previews.REGION}}`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_URL_STYLE=virtual-host`)
- `APP_BASE_URL`, `PREVIEW_HOST` (`<base>/p` until a separate preview domain exists), `QUOTE_HOST`
  (`<base>/q`), `TRACKING_HOST` (`<base>/t`), `ADMIN_API_TOKEN`, and the legal identity variables.

Pushing to `master` redeploys. Healthcheck: `/health`. Adding real providers is a variable change:
`GOOGLE_MAPS_API_KEY`, `ANTHROPIC_API_KEY`, `EMAIL_PROVIDER=ses` + AWS keys, `STRIPE_SECRET_KEY` +
`STRIPE_WEBHOOK_SECRET` (webhook URL `<base>/webhooks/stripe`), `EMAIL_VERIFY_PROVIDER` + key.
CI (`.github/workflows/ci.yml`) runs install → generate → build → typecheck → test with Postgres
and Redis services.
