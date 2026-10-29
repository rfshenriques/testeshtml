import type { Lead, Quote } from '@sitewright/db';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n: number, cur: string) => new Intl.NumberFormat('en', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
const longDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const CSS = `
:root{--paper:#faf9f6;--surface:#ffffff;--ink:#1b1b1a;--ink-2:#5d5c58;--line:#e6e3dc;--line-2:#d6d2c8;--accent:#1f4fd6;--accent-ink:#ffffff;--accent-soft:#e9efff;--ok:#1b6b3a;--ok-soft:#e5f3ea;--radius:14px}
@media(prefers-color-scheme:dark){:root{--paper:#141413;--surface:#1c1c1a;--ink:#f1efe9;--ink-2:#aaa89f;--line:#2d2d2a;--line-2:#3a3a36;--accent:#7ea2ff;--accent-ink:#0b1430;--accent-soft:#1c2744;--ok:#7fd49a;--ok-soft:#173424}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:17px;line-height:1.6;font-feature-settings:"cv11","ss01"}
a{color:var(--accent)}h1,h2,h3{margin:0;line-height:1.15;letter-spacing:-.015em}
h1{font-family:Fraunces,Georgia,"Times New Roman",serif;font-weight:500;font-size:clamp(34px,5vw,48px);letter-spacing:-.02em}
h2{font-size:26px;font-weight:600;margin-bottom:8px}h3{font-size:20px;font-weight:600}
p{margin:0 0 1em}.lede{font-size:19px;color:var(--ink-2);max-width:62ch}.muted{color:var(--ink-2)}.small{font-size:14px}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
.top{display:flex;justify-content:space-between;align-items:center;height:64px;border-bottom:1px solid var(--line);font-size:14px}.top b{font-weight:600;font-size:15px}
section{padding:56px 0}section+section{border-top:1px solid var(--line)}
.eyebrow{font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin-bottom:14px}
.hero{padding:72px 0 48px}.hero .cta{display:flex;gap:12px;flex-wrap:wrap;margin:28px 0 18px}
.meta{display:flex;gap:18px;flex-wrap:wrap;font-size:14px;color:var(--ink-2)}.meta span::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--ok);margin-right:8px;vertical-align:middle}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:48px;padding:0 22px;border-radius:10px;font:inherit;font-size:16px;font-weight:600;text-decoration:none;cursor:pointer;border:1px solid var(--line-2);background:var(--surface);color:var(--ink);transition:background .15s,border-color .15s}
.btn:hover{border-color:var(--ink-2)}.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}.btn.primary:hover{filter:brightness(1.07)}.btn.sm{height:40px;font-size:15px;padding:0 16px}.btn.block{width:100%}
.seg{display:inline-flex;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:4px;gap:2px}.seg button{font:inherit;font-size:14px;font-weight:500;border:0;background:transparent;color:var(--ink-2);padding:7px 14px;border-radius:7px;cursor:pointer}.seg button[aria-pressed=true]{background:var(--accent-soft);color:var(--accent)}
.preview-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 14px}.preview-bar .links{display:flex;gap:16px;font-size:14px}.preview-bar .links button{font:inherit;font-size:14px;background:none;border:0;color:var(--accent);cursor:pointer;padding:0;text-decoration:underline}
.preview-wrap{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:12px}
.preview-wrap iframe{display:block;width:100%;height:640px;border:0;border-radius:8px;background:#fff;margin:0 auto;transition:width .2s}
.preview-wrap.mobile iframe{width:390px;max-width:100%;height:760px;border-radius:30px;border:10px solid #1b1b1a}
.preview-wrap:fullscreen{padding:20px;overflow:auto;background:var(--paper)}.preview-wrap:fullscreen iframe{height:calc(100vh - 96px)}
.plans{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));align-items:stretch;margin-top:28px}
.plan{position:relative;display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:28px}.plan.rec{border:2px solid var(--accent)}
.plan .tag{position:absolute;top:-13px;left:24px;background:var(--accent);color:var(--accent-ink);font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding:4px 10px;border-radius:999px}
.plan .name{font-size:18px;font-weight:600;margin-bottom:14px}.plan .price{font-size:34px;font-weight:600;letter-spacing:-.02em;line-height:1.1}.plan .price small{font-size:15px;font-weight:400;color:var(--ink-2);letter-spacing:0}.plan .monthly{font-size:17px;margin:6px 0 20px}.plan .monthly b{font-weight:600}
.plan ul{list-style:none;padding:0;margin:0 0 24px;display:flex;flex-direction:column;gap:10px;font-size:15px;color:var(--ink)}.plan li{display:flex;gap:10px;align-items:flex-start}.plan li svg{flex:none;width:18px;height:18px;margin-top:3px;color:var(--ok)}.plan li.dim{color:var(--ink-2)}.plan li.dim svg{color:var(--line-2)}
.plan form{margin-top:auto}
table{width:100%;border-collapse:collapse;font-size:15px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}th,td{padding:14px 16px;text-align:left;border-bottom:1px solid var(--line)}th{font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-2)}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}tr:last-child td{border-bottom:0}tfoot td{font-weight:600;background:var(--paper)}
.steps{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin-top:24px}.step{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:24px}.step .n{display:inline-flex;width:32px;height:32px;border-radius:50%;align-items:center;justify-content:center;background:var(--accent-soft);color:var(--accent);font-weight:600;font-size:15px;margin-bottom:14px}.step h3{font-size:17px;margin-bottom:6px}.step p{margin:0;color:var(--ink-2);font-size:15px}
.closing{display:grid;gap:24px;grid-template-columns:1.3fr 1fr;align-items:start}.closing .box{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:28px}
.quiet{font-size:14px;color:var(--ink-2)}footer{border-top:1px solid var(--line);padding:28px 0 48px;font-size:13px;color:var(--ink-2)}
.sticky{display:none}
@media(max-width:720px){section{padding:40px 0}.hero{padding:40px 0 32px}.closing{grid-template-columns:1fr}.sticky{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:20;gap:10px;padding:12px 16px;background:var(--surface);border-top:1px solid var(--line);box-shadow:0 -6px 24px rgba(0,0,0,.08)}.sticky .btn{flex:1;height:44px}body{padding-bottom:76px}.sticky{background:color-mix(in srgb,var(--surface) 82%,transparent);-webkit-backdrop-filter:blur(20px) saturate(180%);backdrop-filter:blur(20px) saturate(180%)}}
`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Fraunces:opsz,wght@9..144,500&display=swap" rel="stylesheet">`;

const shell = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>${FONTS}<style>${CSS}
/* Interface layer (Apple fluid-interface principles): press feedback, spring settle, translucent fixed chrome, reduced-motion/transparency. */
.btn,.btn{touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform .4s linear(0,.0411,.134,.2475,.3635,.4721,.5688,.652,.7219,.7795,.8264,.8641,.8942,.9179,.9366,.9512,.9625,.9713,.9781,.9833,.9873,.9904,1),background-color .15s,border-color .15s,color .15s,filter .15s}
.btn:active,.day:active:not(:disabled),.time:active{transform:scale(.97);transition-duration:90ms;transition-timing-function:ease-out}
@media(hover:hover){.btn:hover:not(:disabled){transform:translateY(-1px)}.btn:active:not(:disabled){transform:scale(.97)}}
h1,h2{letter-spacing:-.02em}
@media(prefers-reduced-motion:reduce){.btn,.btn{transition:background-color .15s,color .15s}.btn:hover,.btn:active,.day:active,.time:active{transform:none!important}}
@media(prefers-reduced-transparency:reduce){.sticky{background:var(--surface)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}}
</style></head><body>${body}</body></html>`;

const check = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.5l4 4 8-9"/></svg>';

export const renderProposal = {
  notFound: () => shell('Not found', `<main class="wrap"><section><h1>Not found</h1><p class="lede">There is no proposal at this address.</p></section></main>`),
  expired: (agency: string, bookingUrl: string) => shell('Proposal expired', `<main class="wrap"><section><h1>This proposal has expired</h1><p class="lede">The quote prepared by ${esc(agency)} is no longer valid. If you are still interested, <a href="${esc(bookingUrl)}">book a call</a> and we will prepare a fresh one.</p></section></main>`),
  thanks: (agency: string) => shell('Thank you', `<main class="wrap"><section><h1>Thank you</h1><p class="lede">Your payment is being confirmed. ${esc(agency)} will be in touch within one working day with the onboarding form: copy, photos, logo and opening hours.</p></section></main>`),
  declined: () => shell('Removed', `<main class="wrap"><section><h1>Done.</h1><p class="lede">The mockup has been deleted and you will not hear from us again.</p></section></main>`),

  page: (p: { quote: Quote; lead: Lead; previewUrl: string | null; acceptUrl: string; bookingUrl: string; declineUrl: string; agency: { name: string; url: string; legalName: string; address: string } }) => {
    const all = p.quote.allTiers as any;
    const tiers = all?.tiers ?? {};
    const cur = p.quote.currency;
    const order = ['starter', 'business', 'premium'];
    const rec = tiers[p.quote.tier];
    const biz = p.lead.businessName;
    const valid = longDate(p.quote.validUntil);

    const nfcCount = (t: any): number => Number(t.nfcTags ?? (t.lineItems ?? []).find((l: any) => /NFC tags ×(\d+) \(included\)/.test(l.label))?.label.match(/×(\d+)/)?.[1] ?? 0);
    const feature = (t: any): { text: string; dim?: boolean }[] => [
      { text: `${t.pages ? `${t.pages}-page` : 'Unlimited-page'} website, built from this concept` },
      { text: `${t.revisions} revision round${t.revisions === 1 ? '' : 's'} before launch` },
      { text: 'Hosting, SSL, backups and security updates' },
      t.updatesPerMonth ? { text: `${t.updatesPerMonth} content update${t.updatesPerMonth === 1 ? '' : 's'} a month, 2-day turnaround` } : { text: 'Content updates on request', dim: true },
      nfcCount(t) ? { text: `Google review + website NFC tags ×${nfcCount(t)} (included)` } : { text: 'NFC tags available as an add-on', dim: true },
      ...(t.label === 'Premium' ? [{ text: 'Local SEO and priority support' }] : []),
      ...t.lineItems.filter((l: any) => !/website build|hosting|nfc tags ×\d+ \(included\)/i.test(l.label)).map((l: any) => ({ text: l.label })),
    ];

    const plans = order.filter((t) => tiers[t]).map((t) => {
      const q = tiers[t];
      const isRec = t === p.quote.tier;
      return `<div class="plan${isRec ? ' rec' : ''}">${isRec ? '<span class="tag">Recommended</span>' : ''}
<div class="name">${esc(q.label)}</div>
<div class="price">${money(q.buildFee, cur)} <small>one-off build</small></div>
<div class="monthly"><b>${money(q.monthly, cur)}</b> <span class="muted">/ month</span></div>
<ul>${feature(q).map((f) => `<li${f.dim ? ' class="dim"' : ''}>${check}<span>${esc(f.text)}</span></li>`).join('')}</ul>
<form method="post" action="${esc(p.acceptUrl)}" data-tier="${t}"><input type="hidden" name="tier" value="${t}"><button class="btn block${isRec ? ' primary' : ''}" type="submit">Choose ${esc(q.label)}</button></form></div>`;
    }).join('');

    const breakdown = rec ? `<table><thead><tr><th>What you pay for</th><th class="n">One-off</th><th class="n">Monthly</th></tr></thead><tbody>${rec.lineItems.map((l: any) => `<tr><td>${esc(l.label)}</td><td class="n">${l.oneOff ? money(l.oneOff, cur) : '—'}</td><td class="n">${l.monthly ? money(l.monthly, cur) : '—'}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total (${esc(rec.label)})</td><td class="n">${money(rec.buildFee, cur)}</td><td class="n">${money(rec.monthly, cur)}</td></tr></tfoot></table>` : '';

    return shell(`Website proposal for ${biz}`, `
<header class="top wrap"><b>${esc(p.agency.name)}</b><span class="muted">Prepared for ${esc(biz)}</span></header>
<main class="wrap">
<section class="hero">
  <div class="eyebrow">Website proposal</div>
  <h1>A website for ${esc(biz)}</h1>
  <p class="lede">We built a concept of what your site could look like, using what people already say about you online. Below is the mockup, three plans to turn it into a real website, and exactly what each one costs.</p>
  <div class="cta"><button class="btn primary" type="button" data-accept>Choose the ${esc(rec?.label ?? 'recommended')} plan</button><a class="btn" href="${esc(p.bookingUrl)}">Talk to us first</a></div>
  <div class="meta"><span>No obligation</span><span>Valid until ${esc(valid)}</span><span>Prices in ${esc(cur)}, excluding VAT where applicable</span></div>
</section>

${p.previewUrl ? `<section>
  <h2>Your concept mockup</h2>
  <p class="muted">Interactive preview. Images are indicative and will be replaced with your own photography; copy and colours are adjusted with you before launch.</p>
  <div class="preview-bar"><div class="seg" role="group" aria-label="Preview size"><button type="button" id="pb-desktop" aria-pressed="true">Desktop</button><button type="button" id="pb-mobile" aria-pressed="false">Mobile</button></div><div class="links"><button type="button" id="pb-max">Maximise</button><a href="${esc(p.previewUrl)}" target="_blank" rel="noopener">Open in a new tab</a></div></div>
  <div class="preview-wrap" id="pw"><iframe src="${esc(p.previewUrl)}" title="Concept mockup for ${esc(biz)}" loading="lazy"></iframe></div>
</section>` : ''}

<section>
  <h2>Choose a plan</h2>
  <p class="muted">Every plan includes the build of this concept, hosting and maintenance. The ${esc(rec?.label ?? '')} plan is our recommendation for a business like yours.</p>
  <div class="plans">${plans}</div>
</section>

<section>
  <h2>What the ${esc(rec?.label ?? '')} plan costs, line by line</h2>
  <p class="muted">No setup surprises: one build fee, then a flat monthly fee.</p>
  ${breakdown}
</section>

<section>
  <h2>How it works</h2>
  <div class="steps">
    <div class="step"><span class="n">1</span><h3>Choose a plan</h3><p>Pay the build fee securely online. The monthly fee starts when your site goes live.</p></div>
    <div class="step"><span class="n">2</span><h3>Send us the real thing</h3><p>A short form for your photos, logo, opening hours and services. We replace every placeholder.</p></div>
    <div class="step"><span class="n">3</span><h3>Live in 7–10 working days</h3><p>You review one draft, we revise, and your site goes live on your own domain.</p></div>
  </div>
</section>

<section>
  <div class="closing">
    <div class="box"><h3>Ready?</h3><p class="muted">Choose the ${esc(rec?.label ?? '')} plan above, or book a short call and we will walk you through the mockup first.</p><div class="cta" style="margin:0"><button class="btn primary" type="button" data-accept>Choose the ${esc(rec?.label ?? 'recommended')} plan</button><a class="btn" href="${esc(p.bookingUrl)}">Talk to us first</a></div></div>
    <div class="box"><h3>Not for you?</h3><p class="quiet">One click and we delete the mockup and your details, and never contact you again.</p><a class="quiet" href="${esc(p.declineUrl)}">Not interested, remove my details</a></div>
  </div>
</section>
</main>
<footer><div class="wrap">${esc(p.agency.legalName)} · ${esc(p.agency.address)} · <a href="${esc(p.agency.url)}">${esc(p.agency.url)}</a></div></footer>
<div class="sticky"><button class="btn primary" type="button" data-accept>Choose ${esc(rec?.label ?? 'plan')}</button><a class="btn" href="${esc(p.bookingUrl)}">Talk to us</a></div>
<script>(function(){var w=document.getElementById('pw'),d=document.getElementById('pb-desktop'),m=document.getElementById('pb-mobile'),x=document.getElementById('pb-max');
if(w&&d&&m&&x){function set(mobile){w.classList.toggle('mobile',mobile);d.setAttribute('aria-pressed',String(!mobile));m.setAttribute('aria-pressed',String(mobile));}d.onclick=function(){set(false)};m.onclick=function(){set(true)};
x.onclick=function(){if(document.fullscreenElement){document.exitFullscreen();}else if(w.requestFullscreen){w.requestFullscreen();}else{window.open(${JSON.stringify(p.previewUrl ?? '')},'_blank');}};document.addEventListener('fullscreenchange',function(){x.textContent=document.fullscreenElement?'Exit full screen':'Maximise';});}
var rec=document.querySelector('form[data-tier="${esc(p.quote.tier)}"]');document.querySelectorAll('[data-accept]').forEach(function(b){b.onclick=function(){if(rec)rec.submit();else document.querySelector('.plans').scrollIntoView({behavior:'smooth'});};});})();</script>`);
  },
};
