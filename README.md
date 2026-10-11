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
  templates/  Astro template workspace: 6 families × 3 colour schemes × 2 typographic pairings
packages/
  shared-types/          enums, zod schemas, queue registry
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

## Deploy

Railway (spec default): one service from `apps/api` (`pnpm build` then `node apps/api/dist/main.js`),
Railway Postgres and Redis, `pnpm db:deploy` on release. Serve `apps/admin/dist` statically (any
host) pointing at the API. Object storage: set `STORAGE_DRIVER=s3` with R2/S3/MinIO credentials.
CI (`.github/workflows/ci.yml`) runs install → generate → build → typecheck → test with Postgres
and Redis services.
