import { INestApplicationContext } from '@nestjs/common';
import * as fs from 'node:fs';
import { HealthService } from '../modules/ops/health.service';
import { CampaignService } from '../modules/territory/campaign.service';
import { DiscoveryService } from '../modules/discovery/discovery.service';
import { QualificationService } from '../modules/qualification/qualification.service';
import { PrismaService } from '../shared/prisma/prisma.service';
import { CostLedgerService } from '../modules/ops/cost-ledger.service';
import { RetentionService } from '../modules/compliance/retention.service';
import { demoSeed } from './demo-seed';

export type CliCommand = (app: INestApplicationContext, args: string[]) => Promise<number>;

export const commands: Record<string, { description: string; run: CliCommand }> = {
  health: {
    description: 'Print the health report',
    run: async (app) => {
      console.log(JSON.stringify(await app.get(HealthService).check(), null, 2));
      return 0;
    },
  },
  'run-campaign': {
    description: 'run-campaign <campaignId | campaign.json> [--no-qualify] [--max-tiles N]  Run discovery (and qualification) inline and print results',
    run: async (app, args) => {
      const prisma = app.get(PrismaService);
      const campaigns = app.get(CampaignService);
      const discovery = app.get(DiscoveryService);
      const qualification = app.get(QualificationService);
      const costs = app.get(CostLedgerService);
      const [target, ...flags] = args;
      if (!target) {
        console.error('usage: run-campaign <campaignId | campaign.json>');
        return 1;
      }
      const maxTiles = Number(flags[flags.indexOf('--max-tiles') + 1] || 0) || 500;
      const qualify = !flags.includes('--no-qualify');
      let campaignId = target;
      if (target.endsWith('.json')) {
        const c = await campaigns.create(JSON.parse(fs.readFileSync(target, 'utf8')), 'cli');
        campaignId = c.id;
        console.log(`created campaign ${c.id} (${c.name})`);
      }
      const c0 = await campaigns.get(campaignId);
      if (c0.status === 'draft' || c0.status === 'paused') await campaigns.start(campaignId, 'cli');
      // Drain the queue entries we just created: we process inline instead.
      let processed = 0;
      const t0 = Date.now();
      while (processed < maxTiles) {
        const tile = await prisma.tile.findFirst({ where: { campaignId, status: { in: ['pending', 'searching'] } }, orderBy: [{ depth: 'asc' }, { createdAt: 'asc' }] });
        if (!tile) break;
        const out = await discovery.processTile(tile.id, { enqueueChildren: false, enqueueLeads: false });
        processed++;
        console.log(`tile ${tile.id} depth=${tile.depth} → ${out.status} results=${out.results} new=${out.newLeads}${out.reason ? ` (${out.reason})` : ''}`);
        if (out.status === 'skipped' && out.reason?.includes('budget')) break;
      }
      const leads = await prisma.lead.findMany({ where: { campaignId }, orderBy: { createdAt: 'asc' } });
      console.log(`\n${processed} tiles processed in ${((Date.now() - t0) / 1000).toFixed(1)}s; ${leads.length} unique places`);
      if (qualify) {
        let i = 0;
        for (const l of leads) {
          if (l.stage !== 'discovered') continue;
          await qualification.qualify(l.id, { advance: false }).catch((e) => console.error(`qualify ${l.id} failed: ${e.message}`));
          i++;
          if (i % 25 === 0) console.log(`qualified ${i}/${leads.length}`);
        }
      }
      const final = await prisma.lead.findMany({ where: { campaignId }, orderBy: [{ score: 'desc' }] });
      const byStatus = new Map<string, number>();
      for (const l of final) byStatus.set(l.websiteStatus, (byStatus.get(l.websiteStatus) ?? 0) + 1);
      console.log('\nwebsite status:', Object.fromEntries(byStatus));
      const byStage = new Map<string, number>();
      for (const l of final) byStage.set(l.stage, (byStage.get(l.stage) ?? 0) + 1);
      console.log('stages:', Object.fromEntries(byStage));
      console.log('\nTop 20 by score:');
      console.table(final.filter((l) => l.stage !== 'excluded').slice(0, 20).map((l) => ({ score: l.score, name: l.businessName.slice(0, 32), type: l.primaryType, site: l.websiteStatus, rating: l.rating, reviews: l.reviewCount, city: l.city })));
      const c = await campaigns.get(campaignId);
      console.log(`\nspend: $${Number(c.spendUsd).toFixed(2)} / cap $${Number(c.budgetUsdCap).toFixed(2)}  status=${c.status}`);
      console.log('costs:', await costs.totalsByCategory(campaignId));
      return 0;
    },
  },
  'demo-seed': {
    description: 'Populate the database with a realistic demo campaign (no external calls); run once on a dev database',
    run: async (app) => {
      console.log(await demoSeed(app));
      return 0;
    },
  },
  'retention:run': {
    description: 'Run the nightly retention/purge job now',
    run: async (app) => {
      console.log(await app.get(RetentionService).runAll());
      return 0;
    },
  },
};

export async function runCli(app: INestApplicationContext, argv: string[]): Promise<number> {
  const [name, ...rest] = argv;
  const cmd = name ? commands[name] : undefined;
  if (!cmd) {
    console.log('Usage: pnpm cli <command> [args]\n');
    for (const [k, v] of Object.entries(commands)) console.log(`  ${k.padEnd(18)} ${v.description}`);
    return name ? 1 : 0;
  }
  return cmd.run(app, rest);
}
