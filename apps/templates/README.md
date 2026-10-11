# @sitewright/templates

Astro template library that turns a `SiteBuildInput` (see
`packages/shared-types/src/schemas.ts`) into a one-page static concept mockup
(spec §9). Six template families, three colour schemes and two typographic
pairings each; every page is labelled as an unofficial mockup, `noindex`, and
built deterministically.

## Build one site

```sh
# from the repo root
pnpm --filter @sitewright/templates build:site path/to/input.json path/to/outDir
# or, with cwd = apps/templates (how the API calls it)
pnpm exec tsx scripts/build-site.ts input.json /tmp/site
```

stdout is a single JSON line and nothing else:

```json
{"buildHash":"<sha256>","files":1,"outDir":"/tmp/site"}
```

- Input is validated with `SiteBuildInputSchema`; invalid input exits 1 with the
  issues on stderr.
- `outDir` is emptied and then receives `index.html` (all CSS inline, no JS, no
  external requests).
- `buildHash` is sha256 over the sorted `(relativePath, content)` pairs. The same
  input always gives the same hash and byte-identical files.
- Each build takes about 4 s on a developer machine (budget: 20 s, spec §9.1).
- Builds are isolated: Astro runs in a private temp directory (a copy of `src/`
  with `node_modules` symlinked, cwd = root = outDir parent), so nothing under
  `apps/templates` is written and two builds can run at once. The input reaches
  the page through `SITEWRIGHT_INPUT` (JSON file path), read in
  `src/pages/index.astro`.

Programmatic use (same isolation, safe to call concurrently):

```ts
import { buildSite } from '@sitewright/templates/build-site';
const { buildHash, files } = await buildSite(input, '/tmp/site');
```

Other scripts:

| Script | Purpose |
| --- | --- |
| `scripts/sample-input.ts <family> [a\|b\|c] [a\|b] [outFile]` | Writes the family fixture as JSON (admin Generator sample pages). |
| `scripts/expired-page.ts` → `expiredPageHtml(agencyName, agencyUrl)` | The self-contained 410 page served after `mockup.expiresAt`. |
| `scripts/check-contrast.ts` | Prints every text/background contrast ratio; fails below 4.5:1. |

Fixtures: `src/fixtures/sample-input.ts` exports `SAMPLE_INPUTS` (one valid
input per family) and `sampleInput(family, colourScheme, typography)`.
`src/templates/index.ts` exports `TEMPLATE_CATALOGUE` (id, verticals, sections)
for `GET /admin/generator/templates`.

## Where things live

```
src/pages/index.astro          reads SITEWRIGHT_INPUT and renders the family template
src/layouts/MockupLayout.astro head (robots, OG, JSON-LD, theme vars), banner, footer, global CSS
src/components/                Hero, Services, WhyUs, About, Gallery, HoursMap, Reviews,
                               ContactForm, CtaBand, Img, Copy, Wordmark, SiteHeader, ...
src/templates/<family>/Site.astro   hospitality, appointment, trades, professional, retail, fitness
src/theme/tokens.ts            palettes, typography, contrast maths
src/lib/input.ts               input loading, placeholder rules, JSON-LD, date/phone helpers
src/lib/placeholder.ts         inline SVG placeholder images (data: URIs)
```

Sections per family follow spec §9.2; every family also gets hours + map,
reviews and a contact form because the spec requires them on every template.

## What every page guarantees

- `<meta name="robots" content="noindex,nofollow">`.
- Sticky, non-dismissible banner first in the DOM: "Unofficial concept mockup
  prepared by {agencyName}. Not affiliated with or endorsed by {businessName}."
  (`agencyName` links to `agencyUrl`).
- Footer: images are indicative and will be replaced with the client's own
  photography; expiry date; "Remove this mockup" → `mockup.takedownUrl`.
- Every `<img>` has `data-placeholder="true"`, alt text and width/height. Images
  come from `input.images`; otherwise grey inline-SVG placeholder blocks.
- Text wordmark from the business name in the display typeface (no emblem).
- `LocalBusiness` JSON-LD (name, address, telephone, openingHours, geo,
  aggregateRating, priceRange when present), Open Graph tags from `copy.meta`.
- `tel:` click-to-call wherever the brief has a phone; map iframe only when
  `mockup.mapEmbedUrl` is set, otherwise a static placeholder block.
- Plain `<form method="post" action={mockup.formEndpoint}>` with the
  "this is a mockup — your message was recorded for demonstration" note.
- Copy only from `input.copy` / `input.brief`. Fields named in
  `copy.placeholdersUsed` (exact path, parent path or leaf name, e.g.
  `about.body`, `services[2]`, `whyUs`) render as a visible neutral
  placeholder. Reviews use `brief.rating`, `brief.reviewCount` and
  `brief.reviewExcerpts` only. No prices, team names, credentials or class times
  are ever invented; those slots are labelled as to be supplied.

## Colour and typography tokens

`src/theme/tokens.ts` defines 18 palettes (`PALETTES[family][scheme]`) and two
pairings (`TYPOGRAPHY.a` Editorial: serif display / system sans body;
`TYPOGRAPHY.b` Modern: heavy sans display / system sans body / monospace
labels). They are emitted on `:root` as:

```
--bg --surface --text --muted --primary --on-primary --accent --on-accent
--hero-bg --on-hero --border
--font-display --font-body --font-label --display-weight --display-tracking
--display-transform --label-transform
```

Components only use these variables. Every text/background pair in
`CONTRAST_PAIRS` is at least 4.5:1 (WCAG AA) in every palette, enforced by
`pnpm --filter @sitewright/templates check:contrast` and `tokens.test.ts`.
Font stacks are system fonts only, so pages work fully offline.

## Lighthouse expectations

Pages are built to score ≥ 95 on Performance, Accessibility and Best Practices:
single HTML file, inline CSS, no JavaScript, no web fonts, no third-party
requests, lazy-loaded images with explicit dimensions, `fetchpriority="high"` on
the hero image, semantic landmarks, labelled form controls, skip link, titled
iframe, AA contrast. One caveat: Lighthouse's SEO category fails its
"page is blocked from indexing" audit by design, because spec §0.6 requires
`noindex` on every preview, so SEO will not reach 95 while the page is a
mockup; the other SEO audits (title, description, viewport, alt text, valid
JSON-LD) pass.

## Commands

```sh
pnpm --filter @sitewright/templates test        # vitest: builds all fixtures, determinism, timing
pnpm --filter @sitewright/templates typecheck   # astro check
pnpm --filter @sitewright/templates build       # plain astro build of the placeholder index
pnpm --filter @sitewright/templates check:contrast
```
