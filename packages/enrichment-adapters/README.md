# @sitewright/enrichment-adapters

Email discovery adapters (spec §6.4) and verification (spec §6.5). Official APIs only — adapters with no official route are shipped as **unavailable** rather than scraping (spec §0.3, §20.6).

## Adapters (recommended cost order)

| Adapter | `name` | Status |
| --- | --- | --- |
| `SocialProfileAdapter` | `social-profile` | Always unavailable. DECISION: Meta/Instagram/TikTok offer no official API for business contact emails; scraping forbidden. Never performs I/O. |
| `CompaniesHouseAdapter` | `registry:companies-house` | GB only, free. Companies House publishes **no emails**, so `find()` returns `[]`. Use `lookupCompany(name, locality)` for the registered office address and the disclosable register URL. |
| `MaltaMbrAdapter` | `registry:malta-mbr` | Unavailable placeholder (no public API). |
| `DirectoryAdapter` | `directory` | Runs the configured licensed providers in order; candidates tagged `directory:<provider>` with `sourceLicence`. Unavailable when no providers are configured. |
| `DataProviderAdapter` | `data-provider:<hunter\|apollo\|none>` | `hunter` → Hunter.io domain-search (only when the lead has a registrable domain and `websiteStatus` is not `none`/`social_only`; indicative cost 0.01 USD). `apollo`/`none` → unavailable. |
| `PatternGuessAdapter` | `pattern-guess` | `info@`, `contact@`, `hello@`, `office@` as `catchall_guess` (confidence 0.3) only for `parked|broken|http_only|live` with a registrable domain. |

`runAdapters(adapters, lead, verify, opts)` iterates the adapters in order, skips unavailable / unsupported ones, verifies every candidate, drops candidates without a `source`, dedupes emails, and stops at the first `valid` result (`stopAtFirstValid`, default `true`).

Every HTTP-backed adapter reports cost through `deps.onCost` (even when the cost is 0) and retries 429/5xx with exponential backoff (max 5 attempts; `deps.sleep` is injectable).

## Verification

- `LocalVerifier` — syntax, built-in disposable-domain list, MX lookup (`resolveMx` injectable). Returns `invalid` or `risky`; **never `valid`**.
- `ZeroBounceVerifier` / `NeverBounceVerifier` — provider checks (indicative 0.008 USD/check).
- `ChainVerifier(local, provider)` — local first; stops on `invalid`, otherwise asks the provider.
- `FakeVerifier` — deterministic test double (`*.valid.test`, `*.invalid.test`, `*.catchall.test`).
- Helpers: `isSyntacticallyValidEmail`, `isDisposableDomain`, `registrableDomain` (public suffix list via `psl`).

Spec §20.1: never send to an unverified address — only a provider result of `valid` qualifies a lead for outreach.
