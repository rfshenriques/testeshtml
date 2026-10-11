# Sitewright operator console (`apps/admin`)

React 19 + TypeScript + Vite 7 + Tailwind 4, TanStack Query/Table/Virtual, react-router 7, recharts, lucide-react.
UI primitives are hand-written shadcn-style components under `src/components/ui` (cva + clsx + tailwind-merge).
It talks only to the admin API described in `docs/API.md`.

## Run

```bash
pnpm install                                  # from the repo root
pnpm --filter @sitewright/shared-types build  # once; the console imports enums/zod schemas from dist
pnpm --filter @sitewright/api start:dev       # API on :3000 (or whatever APP_BASE_URL is)
pnpm --filter @sitewright/admin dev           # console on http://localhost:5173
```

The dev server proxies `/admin/*` and `/health` to `http://localhost:3000` (see `vite.config.ts`).
For a built bundle (`pnpm --filter @sitewright/admin build` → `dist/`), either serve it from the same origin as
the API or set `VITE_API_BASE_URL=https://api.example.com` at build time; the client prefixes every request with it.

Checks:

```bash
pnpm --filter @sitewright/admin typecheck
pnpm --filter @sitewright/admin test
pnpm --filter @sitewright/admin build
```

## Token

The console asks for the admin token once (the API's `ADMIN_API_TOKEN`). It is kept in `localStorage`
(`sitewright.adminToken`) and sent as `Authorization: Bearer …` on every `/admin/*` request by the single client
in `src/lib/api.ts`. A `401` clears the token and shows the login gate again. "Sign out" in the sidebar forgets it.

## Layout

- Left nav: the ten screens.
- Top bar, always visible: **kill-switch state with engage/release** (engage requires typing `PAUSE EVERYTHING`;
  release requires an acknowledgement), unacknowledged alert count, API health dot (polls `GET /health` every 30 s).
- Dark/light follows `prefers-color-scheme` via CSS variables in `src/index.css` (`data-theme="light|dark"` on
  `<html>` overrides).

## Screens

| Route | File | What it does |
|---|---|---|
| `/dashboard` | `src/pages/Dashboard.tsx` | Campaigns running, funnel bar chart, sends today vs cap with per-mailbox bars drawn against the hard 50/day ceiling, mailbox health, spend vs budget, reply/review/approval queue counts, alerts with acknowledge, the four unit-economics numbers. Polls every 30 s. |
| `/campaigns` | `src/pages/campaigns/Campaigns.tsx`, `CreateCampaignDialog.tsx` | List; create dialog with bbox / point+radius / GeoJSON polygon / city-list geometry (validated with the shared zod schema), place-type picker grouped by tier A/B/C with "select tier" shortcuts, budget cap, max leads, language override, http_only toggle. Campaigns are created as drafts. |
| `/campaigns/:id` | `src/pages/campaigns/CampaignDetail.tsx`, `TileMap.tsx` | Tile counts and an SVG map of tile bboxes coloured by status (no map library), leads by stage, cost breakdown, estimate, start/pause/resume/halt/requalify with blast-radius confirmations (halt requires typing `HALT`). |
| `/leads`, `/leads/:id` | `src/pages/leads/Leads.tsx`, `LeadDrawer.tsx` | Virtualised, server-sorted, cursor-paginated table with filters in the URL; row selection and bulk actions (enqueue outreach and suppress require confirmation with the count; suppress requires typing `SUPPRESS`). Row click/Enter opens the drawer: Places snapshot, score breakdown with per-component explanation and weights, classification with confidence, contacts (set primary, add), preview iframe, quote + preview tool, messages, replies, event timeline, tasks, review items, gate state with override form (justification ≥ 20 chars), notes/priority/fallback channel, manual actions. |
| `/review` | `src/pages/Review.tsx` | Open review items by type: low-confidence classifications (inputs shown, every field editable, approve with edits / reject), legal-gate blocks (reason + link to override), copy violations, reply drafts. |
| `/generator` | `src/pages/Generator.tsx` | Template cards, colour scheme / typography selectors and an iframe preview of the sample page (fetched with the bearer token and rendered via `srcDoc`), recent builds, and a full SiteCopy editor for a lead's site with save (`PUT …/site/copy`) and rebuild. |
| `/outreach` | `src/pages/outreach/Outreach.tsx`, `DailyCapInput.tsx` | Sequence editor (max 4 steps), domains and mailboxes (add, pause/resume, warmup stage, daily cap input that hard-clamps to 50 with the reason it must not be raised), reputation line charts with 3 % bounce / 0.1 % complaint / 1 % reply guardrail lines over 7 or 30 days, 7-day send schedule grid, capacity panel, approval queue with rendered preview and approve/cancel. |
| `/inbox` | `src/pages/Inbox.tsx` | Replies with intent badge + confidence, lead summary, editable suggested draft, "Send reply (human-confirmed)" requiring the "I have read this and am sending it myself" acknowledgement, mark handled, reclassify, suppress. |
| `/pricing` | `src/pages/Pricing.tsx` | PricingConfig editor (currency, tiers, add-ons, country multipliers, currency rates) validated against the shared zod schema; quote preview tool (`POST /admin/pricing/preview`). |
| `/compliance` | `src/pages/Compliance.tsx` | Jurisdiction policy table (one row per country, toggles, numbers, notes, confirmedByCounsel; prior-consent countries shown as BLOCKED; add a country), suppression list (search by email/place/domain/reason, add only — the UI states there is no delete), audit log with filters, retention status + run now. |
| `/ops` | `src/pages/Ops.tsx` | Cost by category and by campaign (charts + tables), queue depths with per-queue pause/resume, kill-switch panel, API quota bars, alerts with acknowledge. Polls every 15 s. |

## Conventions

- Every automated decision is explainable in place: score → breakdown (`src/components/ScoreBreakdown.tsx`),
  gate → reason + override, classification → confidence + inputs.
- Destructive or irreversible actions (suppress, send, campaign start/halt, kill switch, queue pause, retention run)
  go through `ConfirmDialog`, which always shows the blast radius and optionally requires a typed phrase or an
  acknowledgement checkbox.
- There is no delete anywhere for suppressions; the per-mailbox daily cap cannot exceed 50 in the UI.
- Data fetching is TanStack Query (`src/lib/query.ts` holds the client, global error toasts and query keys).
  Loading, error and empty states are rendered by `QueryState`.
- `src/lib/types.ts` mirrors the response shapes in `docs/API.md`; enums and zod schemas come from
  `@sitewright/shared-types`.

## Tests

`vitest` + `@testing-library/react` (jsdom): API client bearer/401 handling, score-breakdown explanation,
kill-switch confirmation phrase, daily-cap clamping, and a smoke test that mounts every screen against fixture
responses.
