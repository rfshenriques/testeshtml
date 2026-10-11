import type { Lead, Quote } from '@sitewright/db';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n: number, cur: string) => new Intl.NumberFormat('en', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);

const shell = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<style>:root{--ink:#1a1a1a;--muted:#5b5b5b;--line:#e4e4e4;--accent:#1f5fbf;--bg:#fff}@media(prefers-color-scheme:dark){:root{--ink:#f1f1f1;--muted:#b5b5b5;--line:#333;--accent:#7fb0ff;--bg:#121212}}
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--bg);line-height:1.5}main{max-width:1040px;margin:0 auto;padding:24px 16px 64px}h1{font-size:1.75rem;margin:.2em 0}h2{font-size:1.2rem;margin:1.6em 0 .6em}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}.tier{border:1px solid var(--line);border-radius:12px;padding:20px}.tier.rec{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent)}.badge{display:inline-block;font-size:.75rem;background:var(--accent);color:#fff;padding:2px 8px;border-radius:999px;margin-bottom:8px}
.price{font-size:1.6rem;font-weight:700}.price small{font-size:.9rem;color:var(--muted);font-weight:400}ul{padding-left:18px;color:var(--muted)}.btn{display:inline-block;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;border:1px solid var(--accent);color:var(--accent);margin:4px 8px 4px 0}.btn.primary{background:var(--accent);color:#fff}
iframe{width:100%;height:560px;border:1px solid var(--line);border-radius:12px;background:#fff}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid var(--line);text-align:left}td.n,th.n{text-align:right}.muted{color:var(--muted)}.quiet{font-size:.85rem;color:var(--muted);margin-top:40px}footer{margin-top:48px;font-size:.8rem;color:var(--muted);border-top:1px solid var(--line);padding-top:16px}</style></head><body><main>${body}</main></body></html>`;

export const renderProposal = {
  notFound: () => shell('Not found', '<h1>Not found</h1><p>There is no proposal at this address.</p>'),
  expired: (agency: string, bookingUrl: string) => shell('Proposal expired', `<h1>This proposal has expired</h1><p>The quote prepared by ${esc(agency)} is no longer valid. If you are still interested, <a href="${esc(bookingUrl)}">book a call</a> and we will prepare a fresh one.</p>`),
  page: (p: { quote: Quote; lead: Lead; previewUrl: string | null; acceptUrl: string; bookingUrl: string; declineUrl: string; agency: { name: string; url: string; legalName: string; address: string } }) => {
    const all = p.quote.allTiers as any;
    const tiers = all?.tiers ?? {};
    const cur = p.quote.currency;
    const order = ['starter', 'business', 'premium'];
    const tierCards = order.filter((t) => tiers[t]).map((t) => {
      const q = tiers[t];
      const rec = t === p.quote.tier;
      return `<div class="tier${rec ? ' rec' : ''}">${rec ? '<span class="badge">Recommended for you</span>' : ''}<h3>${esc(q.label)}</h3>
<div class="price">${money(q.buildFee, cur)} <small>one-off</small></div><div class="price">${money(q.monthly, cur)} <small>/ month</small></div>
<ul>${q.lineItems.map((l: any) => `<li>${esc(l.label)}</li>`).join('')}</ul>
<form method="post" action="${esc(p.acceptUrl)}"><input type="hidden" name="tier" value="${t}"><button class="btn${rec ? ' primary' : ''}" type="submit">Accept and start (${esc(q.label)})</button></form></div>`;
    }).join('');
    const recTier = tiers[p.quote.tier];
    const breakdown = recTier ? `<table><tr><th>Item</th><th class="n">One-off</th><th class="n">Monthly</th></tr>${recTier.lineItems.map((l: any) => `<tr><td>${esc(l.label)}</td><td class="n">${l.oneOff ? money(l.oneOff, cur) : '—'}</td><td class="n">${l.monthly ? money(l.monthly, cur) : '—'}</td></tr>`).join('')}<tr><th>Total</th><th class="n">${money(recTier.buildFee, cur)}</th><th class="n">${money(recTier.monthly, cur)}</th></tr></table>` : '';
    return shell(`Website proposal for ${p.lead.businessName}`, `
<p class="muted">${esc(p.agency.name)} · Proposal for</p><h1>${esc(p.lead.businessName)}</h1>
<p>We prepared a concept of what a website for ${esc(p.lead.businessName)} could look like, and a transparent quote to build, host and maintain it. No obligation.</p>
${p.previewUrl ? `<h2>Your concept mockup</h2><iframe src="${esc(p.previewUrl)}" title="Concept mockup" loading="lazy"></iframe><p class="muted"><a href="${esc(p.previewUrl)}" target="_blank" rel="noopener">Open the mockup in a new tab</a> · images are indicative and will be replaced with your own photography.</p>` : ''}
<h2>What's included</h2><div class="grid">${tierCards}</div>
<h2>Monthly breakdown (${esc(recTier?.label ?? '')})</h2>${breakdown}
<h2>Timeline</h2><p>Typically 7–10 working days from the moment we have your brief: real copy, photos, logo, opening hours and service list. You review one draft, we revise, you go live.</p>
<h2>Validity</h2><p>This proposal is valid until <strong>${p.quote.validUntil.toISOString().slice(0, 10)}</strong>. Prices in ${esc(cur)}, excluding VAT where applicable.</p>
<p><a class="btn primary" href="#" onclick="document.querySelector('.tier.rec form')?.submit();return false;">Accept and start</a><a class="btn" href="${esc(p.bookingUrl)}">Talk to us first</a></p>
<p class="quiet"><a href="${esc(p.declineUrl)}">Not interested, remove my details</a> — this deletes the mockup and removes you from any further contact.</p>
<footer>${esc(p.agency.legalName)} · ${esc(p.agency.address)} · <a href="${esc(p.agency.url)}">${esc(p.agency.url)}</a></footer>`);
  },
  thanks: (agency: string) => shell('Thank you', `<h1>Thank you!</h1><p>Your payment is being confirmed. ${esc(agency)} will be in touch within one working day with the onboarding form (copy, photos, logo, opening hours).</p>`),
  declined: () => shell('Removed', '<h1>Done.</h1><p>The mockup has been deleted and you will not hear from us again.</p>'),
};
