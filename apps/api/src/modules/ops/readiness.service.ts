/**
 * Go-live readiness: every external dependency the pipeline needs to run for real, checked live, with
 * the exact fix for anything missing. Surfaced at the top of the Ops screen so the operator can see why
 * leads are not moving (no LLM key, no verifier, no sending domain…) without reading logs.
 */
import { Inject, Injectable } from '@nestjs/common';
import { promises as dns } from 'node:dns';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ENV, Env } from '../../shared/config/config.module';
import { KillSwitchService } from './kill-switch.service';
import { HAND_APPROVAL_COUNT, WARMUP_SCHEDULE } from '@sitewright/shared-types';

export type ReadinessStatus = 'ok' | 'warn' | 'blocker';
export interface ReadinessItem { key: string; label: string; status: ReadinessStatus; detail: string; fix?: string; action?: 'purge-demo' }
export interface Readiness { ready: boolean; blockers: number; warnings: number; items: ReadinessItem[]; checkedAt: string }

const DEMO_DOMAIN = 'getdemostudio.com';
const PLACEHOLDER = /example|change-me|placeholder|test-admin|acme/i;

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

@Injectable()
export class ReadinessService {
  constructor(private readonly prisma: PrismaService, @Inject(ENV) private readonly env: Env, private readonly killSwitch: KillSwitchService) {}

  async check(): Promise<Readiness> {
    const items: ReadinessItem[] = [];
    const e = this.env;

    items.push(e.GOOGLE_MAPS_API_KEY
      ? { key: 'places', label: 'Google Places API key', status: 'ok', detail: 'Discovery and listing photos can run.' }
      : { key: 'places', label: 'Google Places API key', status: 'blocker', detail: 'Discovery cannot search for businesses.', fix: 'Set GOOGLE_MAPS_API_KEY (Places API (New) enabled) and redeploy.' });

    items.push(e.LLM_PROVIDER === 'anthropic' && e.ANTHROPIC_API_KEY
      ? { key: 'llm', label: 'Claude API key', status: 'ok', detail: `Classification and website copy use ${e.LLM_MODEL}; daily cap ${e.LLM_DAILY_USD_CAP} USD.` }
      : { key: 'llm', label: 'Claude API key', status: 'blocker', detail: e.LLM_PROVIDER === 'fake' ? 'LLM_PROVIDER is "fake": leads get placeholder classification and copy.' : 'ANTHROPIC_API_KEY is empty: profiling and copywriting fail.', fix: 'Set LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY (console.anthropic.com → API keys) and redeploy.' });

    const emailOk = (e.EMAIL_PROVIDER === 'ses' && e.AWS_ACCESS_KEY_ID && e.AWS_SECRET_ACCESS_KEY) || (e.EMAIL_PROVIDER === 'smartlead' && e.SMARTLEAD_API_KEY);
    items.push(emailOk
      ? { key: 'email', label: 'Email provider', status: 'ok', detail: `Sending through ${e.EMAIL_PROVIDER === 'ses' ? `Amazon SES (${e.AWS_SES_REGION})` : 'Smartlead'}.` }
      : { key: 'email', label: 'Email provider', status: 'blocker', detail: e.EMAIL_PROVIDER === 'fake' ? 'EMAIL_PROVIDER is "fake": nothing leaves the system.' : `EMAIL_PROVIDER=${e.EMAIL_PROVIDER} but its credentials are missing.`, fix: 'Amazon SES: set EMAIL_PROVIDER=ses, AWS_SES_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (IAM user with ses:SendEmail), verify the sending domain in SES and request production access (out of the sandbox). Or Smartlead: EMAIL_PROVIDER=smartlead + SMARTLEAD_API_KEY.' });

    items.push(e.IMAP_HOST && e.IMAP_USER && e.IMAP_PASS
      ? { key: 'inbound', label: 'Reply inbox', status: 'ok', detail: `Replies are read from ${e.IMAP_HOST} (${e.IMAP_USER}).` }
      : { key: 'inbound', label: 'Reply inbox', status: 'warn', detail: 'No IMAP inbox configured: replies, unsubscribes and bounces by email are not read automatically (SES bounce/complaint webhooks still work at /webhooks/email).', fix: 'Set IMAP_HOST, IMAP_USER, IMAP_PASS for the mailbox that receives replies (the sending address or its catch-all).' });

    const verifierOk = (e.EMAIL_VERIFY_PROVIDER === 'zerobounce' || e.EMAIL_VERIFY_PROVIDER === 'neverbounce') && e.EMAIL_VERIFY_API_KEY;
    items.push(verifierOk
      ? { key: 'verifier', label: 'Email verification', status: 'ok', detail: `${e.EMAIL_VERIFY_PROVIDER} verifies addresses before any send (daily cap ${e.EMAIL_VERIFY_DAILY_CAP}).` }
      : { key: 'verifier', label: 'Email verification', status: 'blocker', detail: 'Only the built-in check is active. It proves a mail server exists but never marks an address "valid", and the gate sends only to valid addresses, so no outreach can go out.', fix: 'Set EMAIL_VERIFY_PROVIDER=zerobounce (or neverbounce) and EMAIL_VERIFY_API_KEY. ZeroBounce: 100 free credits, then ~16 USD per 2,000.' });

    const identity = [e.AGENCY_NAME, e.AGENCY_URL, e.LEGAL_ENTITY_NAME, e.LEGAL_ENTITY_ADDRESS, e.LEGAL_ENTITY_REG_NO, e.PRIVACY_POLICY_URL, e.DPO_EMAIL];
    const placeholders = identity.filter((v) => PLACEHOLDER.test(String(v ?? '')));
    items.push(placeholders.length === 0
      ? { key: 'identity', label: 'Agency identity', status: 'ok', detail: `${e.AGENCY_NAME} · ${e.LEGAL_ENTITY_NAME} · ${e.AGENCY_URL}` }
      : { key: 'identity', label: 'Agency identity', status: 'blocker', detail: `Placeholder values in: ${placeholders.join(', ')}. These are printed on every mockup, email footer and proposal.`, fix: 'Set AGENCY_NAME, AGENCY_URL, LEGAL_ENTITY_NAME, LEGAL_ENTITY_REG_NO, LEGAL_ENTITY_ADDRESS, PRIVACY_POLICY_URL, DPO_EMAIL to your real details and redeploy.' });

    items.push(e.ADMIN_API_TOKEN && !PLACEHOLDER.test(e.ADMIN_API_TOKEN) && e.ADMIN_API_TOKEN.length >= 24
      ? { key: 'admin', label: 'Admin token', status: 'ok', detail: 'Strong token set; it also signs public links.' }
      : { key: 'admin', label: 'Admin token', status: 'warn', detail: 'Weak or placeholder ADMIN_API_TOKEN.', fix: 'Set a long random ADMIN_API_TOKEN (note: changing it invalidates existing unsubscribe/takedown/booking links).' });

    items.push(e.STORAGE_DRIVER === 's3' && e.S3_ACCESS_KEY_ID
      ? { key: 'storage', label: 'Preview storage', status: 'ok', detail: `Object storage bucket "${e.S3_BUCKET_PREVIEWS}".` }
      : { key: 'storage', label: 'Preview storage', status: 'warn', detail: 'Previews are stored on the local disk, which Railway wipes on every redeploy.', fix: 'Set STORAGE_DRIVER=s3 with the bucket credentials.' });

    // Sending domains + live DNS.
    const domains = await this.prisma.sendingDomain.findMany({ include: { mailboxes: true } });
    const real = domains.filter((d) => d.domain !== DEMO_DOMAIN);
    if (real.length === 0) {
      items.push({ key: 'domain', label: 'Sending domain', status: 'blocker', detail: 'No sending domain. Outreach needs a dedicated domain (never your main one) with SPF, DKIM and DMARC.', fix: 'Buy a look-alike domain (e.g. get-youragency.com or youragency-studio.com), verify it in SES (DKIM CNAMEs), add SPF "v=spf1 include:amazonses.com ~all" and DMARC "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain", point MX at your inbox provider, then add it under Outreach → Domains.' });
    } else {
      for (const d of real) {
        const dnsResult = await this.dnsCheck(d.domain);
        const problems = [];
        if (!dnsResult.mx) problems.push('no MX (replies would bounce)');
        if (!dnsResult.spf) problems.push('no SPF record');
        else if (e.EMAIL_PROVIDER === 'ses' && !dnsResult.spf.includes('amazonses.com')) problems.push('SPF does not include amazonses.com');
        if (!dnsResult.dmarc) problems.push('no DMARC record');
        else if (/p=none/i.test(dnsResult.dmarc)) problems.push('DMARC policy is p=none (use quarantine or reject once DKIM passes)');
        if (!dnsResult.dkim) problems.push('no DKIM selector found (SES: add the three CNAMEs; or a selector named "default"/"selector1")');
        items.push(problems.length === 0
          ? { key: `domain:${d.domain}`, label: `Domain ${d.domain}`, status: 'ok', detail: `MX, SPF, DKIM and DMARC present (${dnsResult.dmarc}). ${d.mailboxes.length} mailbox(es).` }
          : { key: `domain:${d.domain}`, label: `Domain ${d.domain}`, status: problems.some((p) => p.startsWith('no SPF') || p.startsWith('no DKIM')) ? 'blocker' : 'warn', detail: problems.join('; ') + '.', fix: 'Fix the DNS records at your registrar, wait for propagation, then re-check here. Mail sent without SPF+DKIM+DMARC lands in spam.' });
      }
      const boxes = real.flatMap((d) => d.mailboxes);
      if (boxes.length === 0) items.push({ key: 'mailboxes', label: 'Mailboxes', status: 'blocker', detail: 'No mailbox on a real domain.', fix: 'Create the mailbox at your email host (e.g. firstname@get-youragency.com), then add it under Outreach → Mailboxes. Start with 1–2 mailboxes.' });
      else {
        const desc = boxes.map((m) => {
          const week = Math.min(WARMUP_SCHEDULE.length, Math.floor((Date.now() - m.warmupStartedAt.getTime()) / (7 * 86400_000)) + 1);
          return `${m.address}: ${m.status}, warm-up week ${week}, ${WARMUP_SCHEDULE[week - 1]}/day`;
        });
        const anyActive = boxes.some((m) => m.status === 'active' || m.status === 'warming');
        items.push({ key: 'mailboxes', label: 'Mailboxes', status: anyActive ? 'ok' : 'warn', detail: desc.join(' · '), fix: anyActive ? undefined : 'Resume or add a mailbox.' });
      }
    }

    const approved = Number((await this.prisma.setting.findUnique({ where: { key: 'outreach.approvedSends' } }))?.value ?? 0);
    items.push({ key: 'approvals', label: 'Hand approval', status: 'ok', detail: approved >= HAND_APPROVAL_COUNT ? `First ${HAND_APPROVAL_COUNT} sends approved; the sequence now sends on its own within the caps.` : `${Math.max(0, HAND_APPROVAL_COUNT - approved)} of the first ${HAND_APPROVAL_COUNT} sends still need your approval under Outreach → Approval queue.` });

    const demoCampaigns = await this.prisma.campaign.count({ where: { name: { contains: '(demo)' } } });
    const demoDomain = domains.some((d) => d.domain === DEMO_DOMAIN);
    if (demoCampaigns > 0 || demoDomain) items.push({ key: 'demo', label: 'Demo data', status: 'warn', detail: `${demoCampaigns} demo campaign(s)${demoDomain ? ' and the demo sending domain' : ''} are still in the database.`, fix: 'Remove them with the button here (the demo seed is already disabled).', action: 'purge-demo' });

    if (await this.killSwitch.isEngaged()) items.push({ key: 'killswitch', label: 'Kill switch', status: 'warn', detail: 'Engaged: nothing is sent or spent.', fix: 'Disengage it in the top bar when ready.' });

    const blockers = items.filter((i) => i.status === 'blocker').length;
    const warnings = items.filter((i) => i.status === 'warn').length;
    return { ready: blockers === 0, blockers, warnings, items, checkedAt: new Date().toISOString() };
  }

  async dnsCheck(domain: string): Promise<{ mx: boolean; spf: string | null; dmarc: string | null; dkim: boolean }> {
    const txt = async (name: string) => withTimeout(dns.resolveTxt(name).then((r) => r.map((x) => x.join(''))).catch(() => [] as string[]), 3000, [] as string[]);
    const [mx, root, dmarcTxt, ...dkim] = await Promise.all([
      withTimeout(dns.resolveMx(domain).then((r) => r.length > 0).catch(() => false), 3000, false),
      txt(domain),
      txt(`_dmarc.${domain}`),
      ...['default', 'selector1', 'selector2', 'google', 'k1', 'mail', 'smtp'].map((s) => withTimeout(dns.resolveCname(`${s}._domainkey.${domain}`).then((r) => r.length > 0).catch(() => dns.resolveTxt(`${s}._domainkey.${domain}`).then((r) => r.length > 0).catch(() => false)), 3000, false)),
    ]);
    return { mx, spf: root.find((t) => /^v=spf1/i.test(t)) ?? null, dmarc: dmarcTxt.find((t) => /^v=DMARC1/i.test(t)) ?? null, dkim: dkim.some(Boolean) };
  }

  /** Delete everything the demo seed created. Idempotent. */
  async purgeDemo(): Promise<{ campaigns: number; leads: number; mailboxes: number; domains: number }> {
    const campaigns = await this.prisma.campaign.findMany({ where: { name: { contains: '(demo)' } }, select: { id: true } });
    const ids = campaigns.map((c) => c.id);
    const leads = ids.length ? await this.prisma.lead.count({ where: { campaignId: { in: ids } } }) : 0;
    if (ids.length) {
      await this.prisma.costEvent.deleteMany({ where: { campaignId: { in: ids } } });
      await this.prisma.campaign.deleteMany({ where: { id: { in: ids } } });
    }
    const domain = await this.prisma.sendingDomain.findUnique({ where: { domain: DEMO_DOMAIN }, include: { mailboxes: true } });
    let mailboxes = 0;
    if (domain) {
      mailboxes = domain.mailboxes.length;
      await this.prisma.outreachMessage.deleteMany({ where: { mailboxId: { in: domain.mailboxes.map((m) => m.id) } } });
      await this.prisma.mailbox.deleteMany({ where: { sendingDomainId: domain.id } });
      await this.prisma.sendingDomain.delete({ where: { id: domain.id } });
    }
    await this.prisma.setting.deleteMany({ where: { key: 'outreach.approvedSends' } });
    await this.prisma.alert.deleteMany({ where: { acknowledgedAt: null } });
    return { campaigns: ids.length, leads, mailboxes, domains: domain ? 1 : 0 };
  }
}
