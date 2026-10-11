import { Injectable, Logger } from '@nestjs/common';
import { LeadStage } from '@sitewright/db';
import { QUEUES, QueueKey } from '@sitewright/shared-types';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { QueueRegistry } from '../../shared/queues/queue-registry.service';
import { KillSwitchService } from '../ops/kill-switch.service';

/**
 * Pipeline orchestration (spec §4):
 *   Territory → Discovery → Qualification → Legal gate → Enrichment → Profiling → Generation
 *   → Preview publish → Quote → Outreach → Reply handling → Conversion → Provisioning → Billing
 * Each stage is idempotent and re-runnable. `next(leadId, completedStage)` enqueues the following
 * job, unless the kill switch is engaged, the campaign is not running, or the lead is terminal.
 */
@Injectable()
export class PipelineService {
  private readonly log = new Logger(PipelineService.name);
  constructor(private readonly prisma: PrismaService, private readonly queues: QueueRegistry, private readonly killSwitch: KillSwitchService) {}

  /** What runs after a stage completes. */
  static readonly NEXT: Partial<Record<LeadStage, { queue: QueueKey; job: string }>> = {
    discovered: { queue: 'qualificationProbe', job: 'qualify' },
    qualified: { queue: 'enrichmentEmail', job: 'enrich' },
    enriched: { queue: 'profilingClassify', job: 'classify' },
    profiled: { queue: 'generatorBuild', job: 'build' },
    generated: { queue: 'previewPublish', job: 'publish' },
    // quoted → outreach.send scheduling is handled by the outreach module (sequence engine)
  };

  async next(leadId: string, completed: LeadStage, extra: Record<string, unknown> = {}): Promise<boolean> {
    const step = PipelineService.NEXT[completed];
    if (!step) return false;
    if (await this.killSwitch.isEngaged()) {
      this.log.warn({ leadId, completed }, 'pipeline halted: kill switch');
      return false;
    }
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { stage: true, campaign: { select: { status: true } } } });
    if (!lead || lead.stage === 'suppressed' || lead.stage === 'excluded' || lead.stage === 'lost') return false;
    if (lead.campaign.status !== 'running' && lead.campaign.status !== 'complete') {
      this.log.debug({ leadId, campaignStatus: lead.campaign.status }, 'pipeline paused: campaign not running');
      return false;
    }
    await this.enqueue(step.queue, step.job, leadId, extra);
    return true;
  }

  /** Enqueue a specific stage job for a lead (used by manual actions and re-runs). Idempotent per lead+job while pending. */
  async enqueue(queue: QueueKey, job: string, leadId: string, extra: Record<string, unknown> = {}, opts: { delayMs?: number; force?: boolean } = {}) {
    const q = this.queues.get(queue);
    const jobId = opts.force ? `${job}-${leadId}-${Date.now()}` : `${job}-${leadId}`;
    await q.add(job, { leadId, ...extra }, { jobId, delay: opts.delayMs });
    this.log.debug({ leadId, queue: QUEUES[queue].name, job }, 'enqueued');
  }
}
