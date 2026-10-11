import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReviewItemStatus, ReviewItemType } from '@sitewright/db';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ProfilingService } from '../profiling/profiling.service';
import { LeadEventsService } from '../crm/lead-events.service';
import { AuditService } from '../compliance/audit.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { leadSummarySelect, toLeadSummary } from '../crm/lead-summary';

/** Manual review queue (spec §13.1 item 4): low-confidence classifications, legal-gate blocks, copy violations, reply drafts. */
@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService, private readonly profiling: ProfilingService, private readonly leadEvents: LeadEventsService, private readonly audit: AuditService, private readonly pipeline: PipelineService) {}

  async list(filter: { type?: ReviewItemType; status?: ReviewItemStatus }) {
    const items = await this.prisma.reviewItem.findMany({
      where: { status: filter.status ?? 'open', ...(filter.type ? { type: filter.type } : {}) },
      orderBy: { createdAt: 'asc' },
      include: { lead: { select: leadSummarySelect } },
      take: 500,
    });
    return items.map((i) => ({ ...i, lead: toLeadSummary(i.lead) }));
  }

  async approve(id: string, edits: Record<string, unknown> | undefined, actor: string) {
    const item = await this.prisma.reviewItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException();
    if (item.status !== 'open') return item;
    switch (item.type) {
      case 'low_confidence_classification':
        await this.profiling.applyApprovedClassification(item.leadId, edits as any, actor);
        break;
      case 'copy_violation': {
        // Operator supplied corrected copy fields → saved on the site and a rebuild is queued.
        const site = await this.prisma.generatedSite.findUnique({ where: { leadId: item.leadId } });
        if (site && edits?.copy) {
          await this.prisma.generatedSite.update({ where: { id: site.id }, data: { copy: edits.copy as Prisma.InputJsonValue } });
          await this.pipeline.enqueue('generatorBuild', 'build', item.leadId, { reason: 'copy approved' }, { force: true });
        }
        break;
      }
      case 'legal_gate_block':
        // Approval of a gate block means "override": must go through the override endpoint with a justification.
        throw new Error('legal gate blocks are resolved via POST /admin/compliance/leads/:id/gate/override with a justification');
      case 'reply_draft':
        // Approving a draft never auto-sends; the inbox "send reply" action is the only path (human-confirmed).
        break;
    }
    const updated = await this.prisma.reviewItem.update({ where: { id }, data: { status: edits ? 'edited' : 'approved', resolvedBy: actor, resolvedAt: new Date(), resolution: (edits ?? {}) as Prisma.InputJsonValue } });
    await this.audit.log('review.approved', { type: item.type, edits }, { actor, leadId: item.leadId, subjectId: id });
    return updated;
  }

  async reject(id: string, note: string | undefined, actor: string) {
    const item = await this.prisma.reviewItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException();
    if (item.status !== 'open') return item;
    if (item.type === 'low_confidence_classification') {
      await this.leadEvents.setStage(item.leadId, 'lost', { reason: 'classification rejected', note });
    }
    const updated = await this.prisma.reviewItem.update({ where: { id }, data: { status: 'rejected', resolvedBy: actor, resolvedAt: new Date(), resolution: { note: note ?? null } } });
    await this.audit.log('review.rejected', { type: item.type, note }, { actor, leadId: item.leadId, subjectId: id });
    return updated;
  }

  counts() {
    return this.prisma.reviewItem.groupBy({ by: ['type'], where: { status: 'open' }, _count: { _all: true } }).then((rows) => rows.map((r) => ({ type: r.type, count: r._count._all })));
  }
}
