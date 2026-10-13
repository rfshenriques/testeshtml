# Decisions

The spec marks several choices as `DECISION` and says to stop and ask the operator before assuming.
This build was produced autonomously, so every such point was resolved with the spec's own stated
default or the safest option, behind configuration, and is listed here for the operator to confirm
or change. Nothing below requires a code change to flip unless noted.

| # | Decision (spec §) | Default taken | Where to change |
|---|---|---|---|
| 1 | Hosting: Railway vs Fly.io vs VPS (§2.1) | Railway, as the spec's default. `docker-compose.yml` covers local dev; the API is a plain Node service with Postgres + Redis. | Deploy target only; no code. |
| 2 | Include `http_only` / poor-quality live sites (§6.2) | Excluded. Detector in place behind `INCLUDE_HTTP_ONLY_SITES` and per-campaign `includeHttpOnly`. | `.env` / campaign create form. |
| 3 | Social-profile enrichment (§6.4 item 1) | Off. No official API exists for the purpose on Meta/TikTok/Instagram; scraping is forbidden. Adapter reports `unavailable`. | `SOCIAL_PROFILE_ADAPTER_ENABLED` (still unavailable unless an official route is added in `packages/enrichment-adapters`). |
| 4 | Commercial data providers (§6.4 item 4, §19.6) | None contracted. Hunter adapter available (domain-keyed, so near-useless for no-domain leads); Apollo/Cognism/Lusha not integrated. Measure hit rate with `GET /admin/enrichment/report` before contracting. | `DATA_PROVIDER`, `DATA_PROVIDER_API_KEY`. |
| 5 | Pricing (§10.1) | Placeholder defaults from the spec: Starter €690/€49, Business €1,450/€99, Premium €2,900/€189, add-ons and country multipliers in `prisma/src/defaults.ts`. Quotes are always in the lead's local currency. | Pricing screen (`PUT /admin/pricing`). |
| 6 | Email provider: SES vs Smartlead/Instantly (§11.4) | SES, with the adapter interface so switching is `EMAIL_PROVIDER=smartlead`. Postmark is deliberately not supported. The Smartlead adapter's endpoint shapes must be verified against current Smartlead docs before use. `fake` for tests. | `EMAIL_PROVIDER`. |
| 7 | Registrar for domain provisioning (§12.2) | Not integrated; it is a human-confirmed checklist item. | `PROVISIONING_CHECKLIST` in `apps/api/src/modules/conversion/conversion.service.ts` if automating. |
| 8 | Reply auto-send (§19.10) | Never. Every substantive reply is drafted and must be sent by a human from the Inbox screen. Only the one-line unsubscribe confirmation is automatic. | None (guardrail). |
| 9 | Target countries and legal positions (§1.1, §19.1) | 22 policies seeded (`prisma/src/jurisdictions.ts`), all `confirmedByCounsel=false`. DE, IT, AT, ES, PL, CA, AU, ZA, NG are blocked for email by default. Any country without a row is blocked. | Compliance screen (`PUT /admin/compliance/jurisdictions/:cc`). |
| 10 | Nigeria (§1.1) | Blocked (consent-preferred) until the operator decides. | As above. |
| 11 | Legal entity details, privacy URL, DPO (§19.2) | Required env vars; the API refuses to boot without them. | `.env`. |
| 12 | Monthly budget ceilings (§19.9) | Per-campaign USD cap (warn 90 %, pause 100 %), daily Places request cap, daily LLM USD cap, daily verification/enrichment caps, global sends/day. | `.env`, campaign form. |
| 13 | Package versions | Pinned to the current stable majors the build was verified on (NestJS 11, Prisma 6, BullMQ 5, Astro 5, Vite 7, TypeScript 5.9) rather than the newest majors on the registry at build time. | `package.json` files. |
| 14 | Warmup network (§11.2 week 1) | Not provided by this system. Week-1 mailboxes allow 0 real sends; the operator must run warmup through the provider or a warmup service. | `WARMUP_SCHEDULE` in `packages/shared-types`. |
| 15 | Google Maps embed on previews (§9.2) | Uses the public `google.com/maps?...&output=embed` iframe URL (official embed, no scraping, no key). | `apps/api/src/modules/generator/generator.service.ts`. |
| 17 | Listing photos in mockups (§0.7 said: do not) | **Operator decision (2026-10-12): use them.** Photos come from the business's own Google listing via the official Places Photo endpoint, are shown with the listing's author attribution, marked `data-placeholder`, stored under the preview prefix so they are deleted with the mockup and never outlive the 30-day cache window, and the proposal says they will be replaced by the client's own photography. The derived brand palette comes from these photos. Google Maps Platform terms still apply; confirm with counsel. | `USE_PLACE_PHOTOS`, `PLACE_PHOTOS_MAX`. |
| 18 | Logos | No reliable logo source exists for a business without a website (Places has none; social platforms cannot be scraped). Mockups use a generated wordmark; a storefront photo with signage often appears among the listing photos. | — |
| 19 | NFC tags (Google review + website) | Business plan includes 1, Premium 2, Starter 0; extras priced per tag (`addOns.nfcTagExtra.perTag`, default €15). Shown on the proposal and tracked in the provisioning checklist. | Pricing screen. |
| 20 | Template families (§9.2 said six) | **Operator decision (2026-10-13): one distinct design per kind of business, ten families** — hospitality, beauty (salons, spas, barbers), clinic (dental, medical, veterinary), trades, automotive, professional (legal, accounting, consulting, other), property, education, retail, fitness. Each family has its own layout, blocks and shape language (`apps/templates/docs/FAMILIES.md`); the hard rules (noindex, banner, placeholders, no invented facts, no JS, system fonts) are unchanged. `appointment` sites were migrated to `clinic`. | `VERTICAL_TEMPLATE` in `packages/shared-types`. |
| 21 | Palettes and typography | Three fixed schemes per family plus three palettes derived from the lead's own listing photos (`brand` light, `brand2` dark, `brand3` tinted), all forced to WCAG AA; five typographic pairings (Editorial, Modern, Geometric, Classic, Technical), system font stacks only. Chosen per lead in the console's design studio. | `packages/shared-types/src/theme.ts`. |
| 22 | Booking calls (operator request 2026-10-13) | Built in: every outreach email and the proposal carry a signed per-lead booking link to a hosted page showing the operator's free slots (weekly hours in the Scheduling screen minus booked meetings minus events in a private iCal feed). No OAuth: calendar sync is one-way via the iCal feed in, and calendar invites (ICS) out to the attendee and the notify address. Reminders (default 3 days, 24 h with forced one-click confirmation, 2 h) are delayed BullMQ jobs; a booking stops the outreach sequence and opens a CRM task. | Scheduling screen; `DEFAULT_AVAILABILITY` in `prisma/src/defaults.ts`. |
| 23 | Booking on mockups | The sites' "book" actions go to a hosted booking page on the mockup (`/p/:slug/book`) that simulates the business's calendar from its listed opening hours; a booking is recorded as a demonstration (form submission + meeting of kind `mockup_demo`) and nobody is emailed. On a signed client the same page connects to their real calendar (provisioning item; not built). | — |
| 16 | Lighthouse SEO ≥ 95 (§9.2) | Not achievable by construction: `noindex` is mandatory and fails Lighthouse's indexing audit. Performance/Accessibility/Best Practices are built to clear 95. | — |

## Guardrails (§20) and where they are enforced

1. Never send to an unverified address: `SendService.dispatch` (contact must be `valid`), `GateService` (`unverified` branch), `EnrichmentService.choosePrimary` (only `valid` can be primary).
2. Never send to a suppressed address/place/domain: `SendService.dispatch` checks `SuppressionService.isSuppressed` at dispatch time; `GateService` blocks suppressed leads; `SuppressionService` has no delete path.
3. Never exceed 50 sends per mailbox per day: `MailboxService.reserveSend` (atomic Redis counter, ceiling 50), `setDailyCap` clamps to 50, admin UI clamps to 50.
4. Never more than 4 messages to one business: `SequenceService.touches` (per place, across campaigns) checked at scheduling and again at dispatch.
5. Never auto-send a reply: `IngestService.act` only drafts; `SendService.sendHumanReply` requires an operator action.
6. Never scrape Google Maps or forbidden platforms: `@sitewright/places-client` uses the official Places API only; the social-profile adapter never fetches.
7. Never publish without noindex + banner: `assertMockupInvariants` in `PreviewService.publish`, plus `X-Robots-Tag` on every response and `robots.txt` disallow.
8. Never cache Google content beyond the window: `PlaceSnapshot.expiresAt` (30 d) + nightly `RetentionService.purgeExpiredSnapshots`.
9. Never generate unverifiable claims: `hallucination-guard.ts` (regenerate once, then neutral fallback + `placeholdersUsed`).
10. Never proceed without a jurisdiction policy: `evaluateGate` returns `no policy for country` first.
