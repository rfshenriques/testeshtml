import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@sitewright/db';
import { ENV, Env } from '../../shared/config/config.module';
import { PrismaService } from '../../shared/prisma/prisma.service';

export type AlertSeverity = 'info' | 'warning' | 'critical';

/** Alerts (spec §14): persisted for the dashboard, logged, and optionally pushed to a webhook (Slack-compatible). */
@Injectable()
export class AlertService {
  private readonly log = new Logger(AlertService.name);
  constructor(private readonly prisma: PrismaService, @Inject(ENV) private readonly env: Env) {}

  async raise(kind: string, severity: AlertSeverity, message: string, meta?: Record<string, unknown>) {
    const alert = await this.prisma.alert.create({
      data: { kind, severity, message, meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined },
    });
    const fn = severity === 'critical' ? 'error' : severity === 'warning' ? 'warn' : 'log';
    this.log[fn]({ alert: kind, severity, message, meta });
    if (this.env.ALERT_WEBHOOK_URL) {
      fetch(this.env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: `[${severity.toUpperCase()}] ${kind}: ${message}` }),
      }).catch((e) => this.log.warn(`alert webhook failed: ${e}`));
    }
    return alert;
  }

  list(unacknowledgedOnly = true, take = 100) {
    return this.prisma.alert.findMany({
      where: unacknowledgedOnly ? { acknowledgedAt: null } : {},
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  acknowledge(id: string) {
    return this.prisma.alert.update({ where: { id }, data: { acknowledgedAt: new Date() } });
  }
}
