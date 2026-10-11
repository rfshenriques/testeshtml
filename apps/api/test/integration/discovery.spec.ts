import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AUTH, closeTestApp, createTestApp } from '../helpers';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { PLACES_CLIENT, PlacesApi, PlacesSearchResult } from '../../src/modules/discovery/places.provider';
import { DiscoveryService } from '../../src/modules/discovery/discovery.service';
import { CampaignService } from '../../src/modules/territory/campaign.service';
import { QualificationService } from '../../src/modules/qualification/qualification.service';
import { WebsiteProbeService } from '../../src/modules/qualification/website-probe.service';
import { DetailsService } from '../../src/modules/discovery/details.service';
import { CostLedgerService } from '../../src/modules/ops/cost-ledger.service';
import { QueueRegistry } from '../../src/shared/queues/queue-registry.service';

/** Synthetic city: dense centre (saturates two levels), sparse elsewhere. */
function makeFakePlaces(costs: () => CostLedgerService): PlacesApi & { searches: number; detailCalls: number } {
  const fake = {
    searches: 0,
    detailCalls: 0,
    async searchNearby(input: { lat: number; lng: number; radiusM: number; includedTypes: string[] }) {
      fake.searches++;
      await costs().record({ category: 'places_search', units: 1, usd: 0.032, campaignId: currentCampaign });
      const dense = input.radiusM > 400; // saturate until tiles are small
      const n = dense ? 20 : 3;
      const out: PlacesSearchResult[] = [];
      for (let i = 0; i < n; i++) {
        // deterministic ids per location bucket so overlapping circles return duplicates (dedupe test)
        const bucket = `${input.lat.toFixed(2)}:${input.lng.toFixed(2)}:${input.includedTypes[0]}:${i}`;
        out.push({
          id: `place-${bucket}`, displayName: `${input.includedTypes[0]} ${i} Ltd`, formattedAddress: `${i} Republic Street, Valletta VLT 1111, Malta`,
          location: { lat: input.lat + (i % 5) * 0.0005, lng: input.lng + Math.floor(i / 5) * 0.0005 },
          primaryType: input.includedTypes[0], types: [input.includedTypes[0]], websiteUri: i % 4 === 0 ? `https://biz-${i}-${input.lat.toFixed(3)}-${input.lng.toFixed(3)}.example`.replace(/\./g, '-').replace('-example', '.example') : i % 4 === 1 ? 'https://www.facebook.com/biz' : null,
          businessStatus: i === 7 ? 'CLOSED_PERMANENTLY' : 'OPERATIONAL', rating: 4.5, userRatingCount: 30 + i, raw: { id: `place-${bucket}` },
        });
      }
      return out;
    },
    async details(placeId: string) {
      fake.detailCalls++;
      await costs().record({ category: 'places_details', units: 1, usd: 0.02, campaignId: currentCampaign });
      return {
        id: placeId, displayName: 'Detail Biz', formattedAddress: 'x', location: null, primaryType: 'dentist', types: ['dentist'], websiteUri: null, businessStatus: 'OPERATIONAL', rating: 4.5, userRatingCount: 40,
        nationalPhoneNumber: '+356 2122 0000', internationalPhoneNumber: '+356 2122 0000', regularOpeningHours: { weekdayDescriptions: ['Monday: 9–5'] }, priceLevel: 2, editorialSummary: 'A dentist.', reviews: [{ text: 'Great', rating: 5 }], photos: [], addressComponents: [{ longText: 'Valletta', shortText: 'Valletta', types: ['locality'] }],
        raw: { id: placeId, nationalPhoneNumber: '+356 2122 0000', priceLevel: 'PRICE_LEVEL_MODERATE', addressComponents: [{ longText: 'Valletta', shortText: 'Valletta', types: ['locality'] }] },
      };
    },
  };
  return fake;
}
let currentCampaign: string | null = null;

describe('Territory + discovery + qualification (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fake: ReturnType<typeof makeFakePlaces>;
  let costsRef: CostLedgerService;

  beforeAll(async () => {
    fake = makeFakePlaces(() => costsRef);
    app = await createTestApp((b) => b.overrideProvider(PLACES_CLIENT).useValue(fake));
    prisma = app.get(PrismaService);
    costsRef = app.get(CostLedgerService);
    // No real network: every probe sees a live page unless the URL is social.
    app.get(WebsiteProbeService).setFetcher(async (url) => ({ status: 200, url, text: async () => (url.includes('robots') ? '' : 'y'.repeat(2000)), headers: new Headers() }));
  });
  afterAll(() => closeTestApp(app));

  it('creates a campaign (validated), starts it, tiles subdivide until the city is covered, leads are deduped', async () => {
    const bad = await request(app.getHttpServer()).post('/admin/campaigns').set(AUTH).send({ name: 'x' }).expect(500);
    expect(bad.body).toBeTruthy();
    const res = await request(app.getHttpServer())
      .post('/admin/campaigns').set(AUTH)
      .send({ name: 'Valletta dentists', countryCode: 'mt', geometry: { kind: 'circle', center: { lat: 35.8989, lng: 14.5146 }, radiusM: 1500 }, includedTypes: ['dentist'], budgetUsdCap: 50 })
      .expect(201);
    const campaignId = res.body.id as string;
    currentCampaign = campaignId;
    expect(res.body.countryCode).toBe('MT');
    expect(res.body.status).toBe('draft');

    await request(app.getHttpServer()).post(`/admin/campaigns/${campaignId}/start`).set(AUTH).expect(201);
    const discovery = app.get(DiscoveryService);
    // Process tiles inline (workers are off in tests), breadth-first.
    let processed = 0;
    for (let round = 0; round < 20; round++) {
      const pending = await prisma.tile.findMany({ where: { campaignId, status: { in: ['pending', 'searching'] } } });
      if (!pending.length) break;
      for (const t of pending) {
        await discovery.processTile(t.id, { enqueueChildren: false, enqueueLeads: false });
        processed++;
      }
    }
    const tiles = await prisma.tile.findMany({ where: { campaignId } });
    expect(tiles.some((t) => t.status === 'saturated')).toBe(true);
    expect(tiles.filter((t) => t.status === 'done').length).toBeGreaterThan(4);
    expect(tiles.every((t) => t.status === 'done' || t.status === 'saturated')).toBe(true);
    expect(Math.max(...tiles.map((t) => t.depth))).toBeGreaterThanOrEqual(2);

    const leads = await prisma.lead.findMany({ where: { campaignId } });
    const placeIds = new Set(leads.map((l) => l.placeId));
    expect(placeIds.size).toBe(leads.length); // dedupe by place_id
    expect(leads.length).toBeGreaterThan(10);
    expect(leads.every((l) => l.stage === 'discovered')).toBe(true);
    expect(leads.find((l) => l.websiteUrl === null)!.websiteStatus).toBe('none');
    expect(leads[0].city).toBe('Valletta');

    // snapshots expire in 30 days; PlaceRef is permanent
    const snap = await prisma.placeSnapshot.findFirst({ where: { placeId: leads[0].placeId } });
    expect(snap!.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 86400_000);
    expect(await prisma.placeRef.count({ where: { placeId: leads[0].placeId } })).toBe(1);

    // every search wrote a cost event and the campaign spend moved
    const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
    expect(Number(c!.spendUsd)).toBeCloseTo(fake.searches * 0.032, 2);
    expect(c!.status).toBe('complete');
    const detail = await request(app.getHttpServer()).get(`/admin/campaigns/${campaignId}`).set(AUTH).expect(200);
    expect(detail.body.tiles.total).toBe(tiles.length);
    expect(detail.body.costs.byCategory[0].category).toBe('places_search');
    const map = await request(app.getHttpServer()).get(`/admin/campaigns/${campaignId}/tiles`).set(AUTH).expect(200);
    expect(map.body[0].bbox).toHaveLength(4);
  });

  it('qualification probes, classifies, scores and excludes live/closed businesses; competitive pressure is computed per tile', async () => {
    const qualification = app.get(QualificationService);
    const leads = await prisma.lead.findMany({ where: { campaignId: currentCampaign! }, take: 12, orderBy: { createdAt: 'asc' } });
    for (const l of leads) await qualification.qualify(l.id, { probeDelayMs: 1, advance: false });
    const after = await prisma.lead.findMany({ where: { id: { in: leads.map((l) => l.id) } } });
    const byStatus = new Map<string, number>();
    for (const l of after) byStatus.set(l.websiteStatus, (byStatus.get(l.websiteStatus) ?? 0) + 1);
    expect(byStatus.get('none')).toBeGreaterThan(0);
    expect(byStatus.get('social_only')).toBeGreaterThan(0);
    expect(byStatus.get('live')).toBeGreaterThan(0);
    const live = after.filter((l) => l.websiteStatus === 'live');
    expect(live.every((l) => l.stage === 'excluded')).toBe(true);
    const closed = after.find((l) => l.businessStatus === 'CLOSED_PERMANENTLY');
    if (closed) expect(closed.stage).toBe('excluded');
    const none = after.filter((l) => l.websiteStatus === 'none' && l.businessStatus === 'OPERATIONAL');
    expect(none.every((l) => l.stage === 'qualified')).toBe(true);
    const bd = none[0].scoreBreakdown as any;
    expect(bd.weights).toBeTruthy();
    expect(bd.competitivePressure).toBeGreaterThan(0);
    expect(none[0].score).toBeGreaterThan(0.3);
    const events = await prisma.leadEvent.findMany({ where: { leadId: none[0].id } });
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['lead.discovered', 'qualification.probed', 'stage.advanced']));
  });

  it('details are fetched once (cached snapshot), only for qualified leads, and write a cost event', async () => {
    const details = app.get(DetailsService);
    const lead = await prisma.lead.findFirst({ where: { campaignId: currentCampaign!, stage: 'qualified' } });
    const before = fake.detailCalls;
    await details.fetch(lead!.id);
    await details.fetch(lead!.id);
    expect(fake.detailCalls).toBe(before + 1);
    const updated = await prisma.lead.findUnique({ where: { id: lead!.id } });
    expect(updated!.phone).toBe('+356 2122 0000');
    expect(updated!.priceLevel).toBe(2);
    expect(await prisma.costEvent.count({ where: { category: 'places_details' } })).toBeGreaterThan(0);
  });

  it('budget: a campaign is paused and an alert raised when spend reaches the cap', async () => {
    const campaigns = app.get(CampaignService);
    const c = await campaigns.create({ name: 'Tiny budget', countryCode: 'MT', geometry: { kind: 'bbox', bbox: [14.50, 35.89, 14.52, 35.91] }, includedTypes: ['cafe', 'bar'], budgetUsdCap: 0.05 });
    currentCampaign = c.id;
    await campaigns.start(c.id);
    const discovery = app.get(DiscoveryService);
    const root = await prisma.tile.findFirst({ where: { campaignId: c.id } });
    await discovery.processTile(root!.id, { enqueueChildren: false, enqueueLeads: false });
    const after = await prisma.campaign.findUnique({ where: { id: c.id } });
    expect(after!.status).toBe('paused');
    expect(Number(after!.spendUsd)).toBeGreaterThanOrEqual(0.05);
    const alert = await prisma.alert.findFirst({ where: { kind: 'budget_exhausted' } });
    expect(alert).toBeTruthy();
    // nothing more is processed while paused
    const next = await prisma.tile.findFirst({ where: { campaignId: c.id, status: 'pending' } });
    if (next) expect((await discovery.processTile(next.id)).status).toBe('skipped');
    await expect(campaigns.start(c.id)).rejects.toThrow(/budget/);
    await request(app.getHttpServer()).post(`/admin/campaigns/${c.id}/halt`).set(AUTH).expect(201);
  });

  it('starting a campaign enqueues root tiles on the discovery queue', async () => {
    const campaigns = app.get(CampaignService);
    const c = await campaigns.create({ name: 'Queued', countryCode: 'MT', geometry: { kind: 'cities', cities: [{ name: 'Valletta', lat: 35.8989, lng: 14.5146, radiusM: 800 }, { name: 'Sliema', lat: 35.9122, lng: 14.5042, radiusM: 800 }] }, includedTypes: ['bakery'], budgetUsdCap: 5 });
    const r = await campaigns.start(c.id);
    expect(r.enqueued).toBe(2);
    const counts = await app.get(QueueRegistry).get('discoveryTile').getJobCounts('waiting', 'delayed', 'active');
    expect((counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.active ?? 0)).toBeGreaterThanOrEqual(2);
  });
});
