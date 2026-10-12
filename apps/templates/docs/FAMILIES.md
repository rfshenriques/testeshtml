# Template families: design brief

Ten families, one per kind of business. **Each family is a different website**, not the same
sections re-ordered: its own hero shape, section rhythm, block types, card shapes, dividers,
nav and CTA placement. A visitor should be able to tell a garage from a law firm from a salon
with the colours stripped out.

## Hard rules (every family, never relaxed)

These are enforced by `scripts/build-site.test.ts`, the API's `assertMockupInvariants` and spec §0/§9/§20.

- Use `MockupLayout` as the document shell (banner first in the DOM, noindex meta, JSON-LD, footer). Never add a close control to the banner.
- Every `<img>` goes through `components/Img.astro` (alt, width, height, `data-placeholder="true"`, SVG placeholder when no image). No other `<img>`.
- No JavaScript, no external stylesheets or fonts, no `@import`, no `<link rel>`. CSS lives in `<style is:global>` scoped by `[data-template="<family>"]` or in scoped component `<style>` blocks. `<details>/<summary>` is fine for accordions.
- Every fact on the page comes from `input.brief`, `input.copy` or `input.mockup`. Never invent prices, years, awards, staff names, qualifications, listings, products, class names or timetables. Where a real site would show them, show a clearly labelled placeholder (`To be supplied by the business`, class `ph`, or a `<Img>` placeholder) and say so in one line.
- Keep these building blocks (the tests look for their markup): `SiteHeader` or your own header containing `<Wordmark name={brief.businessName} />` (exact markup `class="wordmark wordmark--sm" href="#top" aria-label="… — home"`), `ContactForm` (`<form class="form" method="post" action={mockup.formEndpoint}` + `<button class="btn btn-primary btn-lg" type="submit">`), `HoursMap` or your own block that still renders `<table class="hours-table"` and the `Map placeholder` text when `mockup.mapEmbedUrl` is null, `Reviews` (rating to one decimal + every excerpt), `href="tel:…"` whenever a phone exists, `copy.placeholdersUsed` respected through `Copy.astro`.
- `id="main"` on `<main>`; `href="#top"` target exists; headings in order (one h1); 44px tap targets; WCAG AA using only the CSS custom properties from `theme/tokens.ts` (`--bg --surface --text --muted --primary --on-primary --accent --on-accent --hero-bg --on-hero --border --font-display --font-body --font-label --display-weight --display-tracking --display-transform --label-transform`). Never hard-code colours except pure white/black overlays on photos.
- Works at 360px and 1440px with no horizontal scroll. Deterministic output (no dates, random ids).
- Build must stay under 20 s. Prefer CSS over markup volume.

## Shared vocabulary

`components/` holds the generic blocks (Hero, Section, Services, About, Gallery, HoursMap, Reviews, ContactForm, CtaBand, WhyUs, Img, Copy, Wordmark). Use them where they fit; **write family-specific components** under `templates/<family>/` for anything that gives the family its character. Do not edit shared components in ways that change other families' output.

## The families

| family | verticals | the one thing the site must do | shape language |
|---|---|---|---|
| hospitality | restaurant, cafe, bar, bakery, hotel, events | make you hungry and get a table | full-bleed photo hero with dark overlay and oversized centred wordmark; "today" strip under hero (open now, price level, rating); menu as two-column dotted-leader list grouped under one heading; photo mosaic (CSS grid spans); reservations band with warm gradient; horizontal scroll-snap review cards; serif by default |
| beauty | salon, spa, barber | book a chair | magazine layout: asymmetric hero with large type overlapping an offset portrait image, thin hairlines, generous whitespace; services as a price-list (name, one line, *on request* in italic); "what to expect" as three numbered steps in a row; 2:3 portrait gallery; booking panel beside hours; pill buttons |
| clinic | dental, medical, vet, physio | reassure and book | split hero on a tinted panel: headline + reassurance checklist (from whyUs) + an **appointment card** (phone, today's hours, Book button); services as 3-col tiles with a left accent bar; "your first visit" 3 steps; FAQ via `<details>` (from whyUs/about); map + hours; squared corners, lots of white; sticky bottom call bar on mobile |
| trades | plumber, electrician, roofer, builder | get the phone ringing | top **call bar** with phone; hero as dark band with uppercase headline and the quote form **inside the hero** (right column); service tiles with chevrons; trust strip of verifiedFacts as badges; service-area block with map; heavy borders, skewed/diagonal dividers (`clip-path`), tight corners |
| automotive | garage, MOT, car wash, dealer | book the car in | dark hero with a **book-a-service strip** (3 inputs + button, posting to formEndpoint); services as horizontal cards; "how it works" 3 steps; 16:9 wide gallery; hours + map; uppercase labels, chevron/stripe accent lines, industrial feel |
| professional | legal, accounting, insurance, consulting | arrange a consultation | **no hero image**: large serif headline on cream with a hairline, two-column intro; practice areas as a numbered two-column list with hairlines; "how we work" 3 steps; credentials panel in a bordered box (verifiedFacts; say unverified items are omitted); one large pull quote + small quotes; office hours; consultation form split with contact details; narrow measure, no cards |
| property | estate / letting agents | request a valuation | big photo hero with an overlaid **enquiry card** (buy / rent / valuation radio + area field + button, posting to formEndpoint); "featured listings" as 3 placeholder property cards labelled *Listing to be supplied*; services as tiles; area guide for `brief.city` with map; about; reviews; valuation form; clean, large photography |
| education | school, tutoring, nursery, courses | enrol or visit | friendly: hero with soft coloured shapes, headline, two CTAs; programmes as cards with a level chip (from services); "how it works" 3 steps; "why families choose us"; FAQ `<details>`; hours + map; enquiry form; rounded corners, playful but readable |
| retail | shops | come in / ask about a product | compact **info bar** (hours today, phone); split hero with product photo on a tinted panel; **category tiles** 4-up with image placeholders (from services); featured products as cards (*ask in store*); promo band (from cta); store info hours + map; reviews; contact form; grid-heavy |
| fitness | gym, yoga, studio | book a trial | oversized uppercase hero with image behind and a diagonal cut; classes as a horizontal list (from services); **weekly timetable** table built from openingHours (label it opening times, never invent classes); membership as 3 columns each *Pricing on request*; trial band; gallery; reviews; trial form; dark/bright |

## Deliverable per family

- `templates/<family>/Site.astro` (+ any `templates/<family>/*.astro` components).
- `pnpm --filter @sitewright/templates test` and `pnpm --filter @sitewright/templates typecheck` green.
- Desktop (1280) and phone (390) screenshots of the sample page for review.
