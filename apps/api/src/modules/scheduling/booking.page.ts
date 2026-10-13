/**
 * Hosted booking pages (server-rendered shell + a little inline JS that loads slots in the visitor's
 * time zone and posts the booking). Two hosts share the same page:
 *   - the operator (calls booked from outreach emails and the proposal page), neutral styling;
 *   - a concept mockup (the site's "book" actions), themed with the mockup's own palette and marked
 *     as a demonstration.
 * Every page is noindex and carries no third-party assets.
 */
import type { Palette } from '@sitewright/shared-types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

export interface BookingPageOptions {
  /** Who the visitor is booking with. */
  host: string;
  title: string;
  durationMinutes: number;
  /** Base URL of this booking resource: `${base}/slots` and POST `${base}`. */
  base: string;
  /** What the visitor gets (bullets). */
  points: string[];
  /** Optional context line under the title. */
  context?: string | null;
  /** Mockup mode: demonstration banner + themed palette. */
  mockup?: { agencyName: string; agencyUrl: string; businessName: string; palette: Palette } | null;
  /** Prefill. */
  name?: string | null;
  email?: string | null;
  /** Carried into the POST (e.g. `proposal`). */
  source?: string | null;
  rescheduleOf?: string | null;
  hoursNote?: string | null;
}

const NEUTRAL: Palette = { bg: '#f6f7f9', surface: '#ffffff', text: '#14181f', muted: '#5a6270', primary: '#1f3a5f', onPrimary: '#ffffff', accent: '#0e7c6b', onAccent: '#ffffff', heroBg: '#14181f', onHero: '#ffffff', border: '#dde2e8' };

function shell(title: string, palette: Palette, body: string, extraHead = ''): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title>
<style>
:root{--bg:${palette.bg};--surface:${palette.surface};--text:${palette.text};--muted:${palette.muted};--primary:${palette.primary};--on-primary:${palette.onPrimary};--accent:${palette.accent};--on-accent:${palette.onAccent};--hero:${palette.heroBg};--on-hero:${palette.onHero};--border:${palette.border}}
*,*::before,*::after{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--primary)}h1,h2,h3{line-height:1.15;margin:0 0 .4em;letter-spacing:-.01em}h1{font-size:clamp(1.6rem,3.5vw,2.2rem)}h2{font-size:1.15rem}h3{font-size:1rem}
.banner{background:#111;color:#fff;text-align:center;font-size:.9rem;padding:.55rem 1rem;border-bottom:2px solid #ffd166}.banner a{color:#ffd166;font-weight:600}
.wrap{width:min(100% - 2rem,64rem);margin:0 auto;padding:2rem 0 4rem}
.grid{display:grid;gap:1.5rem;grid-template-columns:1fr}@media(min-width:52rem){.grid{grid-template-columns:minmax(0,19rem) minmax(0,1fr);gap:2rem}}
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:1.5rem}
.eyebrow{display:block;font-size:.75rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin-bottom:.6rem}
.muted{color:var(--muted)}.small{font-size:.9rem}
.points{margin:1rem 0 0;padding:0;list-style:none;display:grid;gap:.6rem}.points li{padding-left:1.5rem;position:relative}.points li::before{content:'';position:absolute;left:0;top:.5em;width:.75rem;height:.75rem;border-radius:50%;background:var(--accent)}
.meta{display:grid;gap:.35rem;margin-top:1.25rem;font-size:.95rem}.meta b{font-weight:600}
label{display:grid;gap:.3rem;font-size:.9rem;font-weight:600}input,select,textarea{font:inherit;padding:.7rem .85rem;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);width:100%;min-height:44px}textarea{min-height:5.5rem;resize:vertical}
select.tz{font-weight:400}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;min-height:44px;padding:.7rem 1.2rem;border-radius:10px;border:1px solid var(--primary);background:var(--primary);color:var(--on-primary);font-weight:600;text-decoration:none;cursor:pointer;font-size:1rem}.btn:disabled{opacity:.5;cursor:not-allowed}.btn.ghost{background:transparent;color:var(--primary)}
.days{display:flex;gap:.5rem;overflow-x:auto;padding:.25rem 0 .75rem;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch}.day{flex:0 0 auto;scroll-snap-align:start;min-width:4.6rem;padding:.55rem .5rem;border:1px solid var(--border);border-radius:10px;background:var(--surface);text-align:center;cursor:pointer;font:inherit;color:var(--text)}.day small{display:block;font-size:.72rem;color:var(--muted);font-weight:400}.day b{display:block;font-size:1.15rem;line-height:1.2}.day[aria-pressed=true]{border-color:var(--primary);background:var(--primary);color:var(--on-primary)}.day[aria-pressed=true] small{color:var(--on-primary);opacity:.85}.day:disabled{opacity:.45;cursor:not-allowed}
.times{display:grid;grid-template-columns:repeat(auto-fill,minmax(6.5rem,1fr));gap:.5rem;margin-top:.5rem}.time{min-height:44px;border:1px solid var(--border);border-radius:10px;background:var(--surface);font:inherit;font-weight:600;color:var(--primary);cursor:pointer}.time[aria-pressed=true]{background:var(--primary);color:var(--on-primary);border-color:var(--primary)}
.form{display:grid;gap:.9rem;margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid var(--border)}.row{display:grid;gap:.9rem}@media(min-width:40rem){.row{grid-template-columns:1fr 1fr}}
.pick{display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:baseline;justify-content:space-between;margin-bottom:.75rem}
.status{font-size:.95rem;margin-top:.75rem;min-height:1.4em}.status.err{color:#9b1c1c;font-weight:600}
.done{display:none}.done.show{display:block}.done .big{font-size:1.25rem;font-weight:700;margin:.5rem 0}
.note{font-size:.85rem;color:var(--muted);border:1px dashed var(--border);border-radius:8px;padding:.6rem .8rem;margin-top:1rem}
.foot{margin-top:2rem;font-size:.85rem;color:var(--muted)}
.actions{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1rem}
.skel{height:44px;border-radius:10px;background:linear-gradient(90deg,var(--border),var(--surface),var(--border));background-size:200% 100%;animation:sk 1.2s infinite}@keyframes sk{to{background-position:-200% 0}}
@media(prefers-reduced-motion:reduce){.skel{animation:none}}
</style>${extraHead}</head><body>${body}</body></html>`;
}

export function bookingPage(o: BookingPageOptions): string {
  const palette = o.mockup?.palette ?? NEUTRAL;
  const banner = o.mockup ? `<div class="banner" role="note">Unofficial concept mockup prepared by <a href="${esc(o.mockup.agencyUrl)}" rel="noopener">${esc(o.mockup.agencyName)}</a>. Not affiliated with or endorsed by ${esc(o.mockup.businessName)}. Bookings made here are a demonstration.</div>` : '';
  const cfg = { base: o.base, duration: o.durationMinutes, source: o.source ?? null, rescheduleOf: o.rescheduleOf ?? null, mockup: !!o.mockup, host: o.host };
  const body = `${banner}<main class="wrap"><div class="grid">
<aside class="card"><span class="eyebrow">${o.mockup ? 'Book online' : 'Book a call'}</span><h1>${esc(o.title)}</h1>${o.context ? `<p class="muted">${esc(o.context)}</p>` : ''}
<ul class="points">${o.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
<div class="meta"><div><b>With</b> ${esc(o.host)}</div><div><b>Duration</b> ${o.durationMinutes} minutes</div><div><b>Your time zone</b> <select class="tz" id="tz" aria-label="Time zone"></select></div></div>
${o.hoursNote ? `<p class="note">${esc(o.hoursNote)}</p>` : ''}</aside>
<section class="card" id="picker" aria-live="polite">
<div class="pick"><h2 id="pick-h">Pick a day</h2><span class="small muted" id="range"></span></div>
<div class="days" id="days" role="group" aria-label="Days"><div class="skel" style="width:100%"></div></div>
<h3 id="times-h" style="margin-top:1rem">Times</h3>
<div class="times" id="times"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>
<form class="form" id="form" hidden>
<div class="row"><label>Your name<input name="name" required autocomplete="name" value="${esc(o.name ?? '')}"></label><label>Email<input name="email" type="email" required autocomplete="email" value="${esc(o.email ?? '')}"></label></div>
<div class="row"><label>Phone (optional)<input name="phone" type="tel" autocomplete="tel"></label><label>Anything we should know? (optional)<input name="notes"></label></div>
<div class="status" id="status"></div>
<div class="actions"><button class="btn" type="submit" id="submit">Confirm <span id="submit-when"></span></button><button class="btn ghost" type="button" id="change">Change time</button></div>
${o.mockup ? `<p class="note">This is a mockup: your booking is recorded for demonstration only and nothing is sent to ${esc(o.mockup.businessName)}. On the live site this connects to their calendar.</p>` : `<p class="note">You will receive a confirmation email with a calendar invite and a link to change or cancel.</p>`}
</form>
<div class="done" id="done"><span class="eyebrow">Booked</span><h2>You're in the diary</h2><p class="big" id="done-when"></p><p id="done-text" class="muted"></p><div class="actions" id="done-actions"></div></div>
</section></div>
<p class="foot">${o.mockup ? `Demonstration booking flow on a concept mockup. ` : ''}Times are shown in your time zone. No account needed.</p></main>
<script>
(function(){
var cfg=${json(cfg)};
var $=function(id){return document.getElementById(id)};
var zones=['Europe/Lisbon','Europe/London','Europe/Dublin','Europe/Madrid','Europe/Paris','Europe/Berlin','Europe/Amsterdam','Europe/Rome','Europe/Malta','Europe/Warsaw','Europe/Stockholm','Europe/Helsinki','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Toronto','Africa/Lagos','Africa/Johannesburg','Australia/Sydney','UTC'];
var tz=(Intl.DateTimeFormat().resolvedOptions().timeZone)||'UTC';if(zones.indexOf(tz)<0)zones.unshift(tz);
var sel=$('tz');zones.forEach(function(z){var o=document.createElement('option');o.value=z;o.textContent=z.replace(/_/g,' ');if(z===tz)o.selected=true;sel.appendChild(o)});
var slots=[],byDay={},dayKeys=[],chosenDay=null,chosen=null;
function dayKey(d){return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
function fmtDay(d){return new Intl.DateTimeFormat(undefined,{timeZone:tz,weekday:'short',day:'numeric',month:'short'}).format(d)}
function fmtTime(d){return new Intl.DateTimeFormat(undefined,{timeZone:tz,hour:'2-digit',minute:'2-digit'}).format(d)}
function fmtFull(d){return new Intl.DateTimeFormat(undefined,{timeZone:tz,weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(d)}
function load(){
 $('days').innerHTML='<div class="skel" style="width:100%"></div>';$('times').innerHTML='<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
 fetch(cfg.base+'/slots?tz='+encodeURIComponent(tz),{headers:{accept:'application/json'}}).then(function(r){return r.json()}).then(function(j){
  slots=(j.slots||[]).map(function(s){return new Date(s)});byDay={};dayKeys=[];
  slots.forEach(function(d){var k=dayKey(d);if(!byDay[k]){byDay[k]=[];dayKeys.push(k)}byDay[k].push(d)});
  $('range').textContent=slots.length?('Next '+(j.horizonDays||14)+' days'):'';
  renderDays();if(dayKeys.length){pickDay(dayKeys[0])}else{$('times').innerHTML='<p class="muted">No free times in the next '+(j.horizonDays||14)+' days. '+(cfg.mockup?'':'Reply to the email and we will find a time.')+'</p>'}
 }).catch(function(){$('times').innerHTML='<p class="status err">Could not load available times. Please refresh.</p>'});
}
function renderDays(){var el=$('days');el.innerHTML='';
 var start=new Date();for(var i=0;i<14;i++){var d=new Date(start.getTime()+i*86400000);var k=dayKey(d);var b=document.createElement('button');b.type='button';b.className='day';b.disabled=!byDay[k];b.setAttribute('aria-pressed',k===chosenDay?'true':'false');var parts=fmtDay(d).split(' ');b.innerHTML='<small>'+parts[0]+'</small><b>'+(parts[1]||'')+'</b><small>'+(parts[2]||'')+'</small>';(function(k){b.onclick=function(){pickDay(k)}})(k);el.appendChild(b)}
}
function pickDay(k){chosenDay=k;chosen=null;$('form').hidden=true;renderDays();var el=$('times');el.innerHTML='';(byDay[k]||[]).forEach(function(d){var b=document.createElement('button');b.type='button';b.className='time';b.textContent=fmtTime(d);b.onclick=function(){pickTime(d,b)};el.appendChild(b)})}
function pickTime(d,btn){chosen=d;Array.prototype.forEach.call(document.querySelectorAll('.time'),function(x){x.setAttribute('aria-pressed','false')});btn.setAttribute('aria-pressed','true');$('submit-when').textContent=fmtDay(d)+' '+fmtTime(d);$('form').hidden=false;$('status').textContent='';$('form').querySelector('[name=name]').focus()}
$('change').onclick=function(){$('form').hidden=true;chosen=null;Array.prototype.forEach.call(document.querySelectorAll('.time'),function(x){x.setAttribute('aria-pressed','false')})};
sel.onchange=function(){tz=sel.value;load()};
$('form').onsubmit=function(e){e.preventDefault();if(!chosen)return;var f=e.target;var btn=$('submit');btn.disabled=true;$('status').className='status';$('status').textContent='Booking…';
 fetch(cfg.base,{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({startAt:chosen.toISOString(),name:f.name.value,email:f.email.value,phone:f.phone.value,notes:f.notes.value,timezone:tz,source:cfg.source,rescheduleOf:cfg.rescheduleOf})})
 .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})}).then(function(x){btn.disabled=false;if(!x.ok){$('status').className='status err';$('status').textContent=x.j.message||'Could not book that time.';if(x.j.status===409)load();return}
  $('picker').querySelector('.pick').hidden=true;$('days').hidden=true;$('times').hidden=true;$('times-h').hidden=true;$('form').hidden=true;var d=$('done');d.className='done show';$('done-when').textContent=fmtFull(chosen)+' ('+tz.replace(/_/g,' ')+')';
  $('done-text').textContent=cfg.mockup?('Demonstration only: this booking was recorded on the mockup and nothing was sent to '+cfg.host+'. On the live site it would go straight into their calendar.'):('A confirmation is on its way to '+f.email.value+' with a calendar invite. We will call you at that time.');
  var a=$('done-actions');a.innerHTML='';if(x.j.icsUrl){var l=document.createElement('a');l.className='btn';l.href=x.j.icsUrl;l.textContent='Add to calendar';a.appendChild(l)}if(x.j.manageUrl&&!cfg.mockup){var m=document.createElement('a');m.className='btn ghost';m.href=x.j.manageUrl;m.textContent='Change or cancel';a.appendChild(m)}
  window.scrollTo({top:0,behavior:'smooth'})}).catch(function(){btn.disabled=false;$('status').className='status err';$('status').textContent='Network error. Please try again.'})};
load();
})();
</script>`;
  return shell(o.title, palette, body);
}

export interface ManagePageOptions {
  host: string;
  title: string;
  whenText: string;
  status: string;
  base: string;
  bookAgainUrl: string | null;
  justConfirmed?: boolean;
}

export function managePage(o: ManagePageOptions): string {
  const cancelled = o.status === 'cancelled';
  const past = o.status === 'completed' || o.status === 'no_show';
  const body = `<main class="wrap" style="max-width:40rem"><div class="card">
<span class="eyebrow">${cancelled ? 'Cancelled' : o.status === 'confirmed' ? 'Confirmed' : 'Scheduled'}</span><h1>${esc(o.title)}</h1><p class="muted">With ${esc(o.host)}</p>
<p class="big" style="font-size:1.2rem;font-weight:700">${esc(o.whenText)}</p>
${o.justConfirmed ? `<p class="status" style="color:var(--accent);font-weight:600">Thanks, the call is confirmed.</p>` : ''}
${cancelled ? `<p class="muted">This booking was cancelled.${o.bookAgainUrl ? ` You can <a href="${esc(o.bookAgainUrl)}">pick another time</a>.` : ''}</p>` : past ? `<p class="muted">This call has already taken place.</p>` : `
<div class="actions">
${o.status !== 'confirmed' ? `<form method="post" action="${esc(o.base)}/confirm"><button class="btn" type="submit">Confirm I'll be there</button></form>` : ''}
${o.bookAgainUrl ? `<a class="btn ghost" href="${esc(o.bookAgainUrl)}">Pick a different time</a>` : ''}
<a class="btn ghost" href="${esc(o.base)}/ics">Add to calendar</a>
</div>
<details style="margin-top:1.25rem"><summary class="muted small" style="cursor:pointer">Need to cancel?</summary>
<form method="post" action="${esc(o.base)}/cancel" class="form"><label>Reason (optional)<input name="reason" maxlength="300"></label><div><button class="btn ghost" type="submit">Cancel this call</button></div></form></details>`}
</div><p class="foot">Times are shown in the time zone you booked in.</p></main>`;
  return shell(o.title, NEUTRAL, body);
}

export function simplePage(title: string, text: string, link?: { href: string; label: string }): string {
  return shell(title, NEUTRAL, `<main class="wrap" style="max-width:40rem"><div class="card"><h1>${esc(title)}</h1><p class="muted">${esc(text)}</p>${link ? `<div class="actions"><a class="btn" href="${esc(link.href)}">${esc(link.label)}</a></div>` : ''}</div></main>`);
}
