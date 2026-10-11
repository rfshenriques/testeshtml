/** Queue registry (spec §2.3). All queues emit to the cost ledger and are individually pausable. */
export interface QueueSpec {
  name: string;
  concurrency: number;
  /** BullMQ limiter: max jobs per duration ms. Omitted = unlimited. */
  limiter?: { max: number; duration: number };
  notes?: string;
}

export const QUEUES = {
  discoveryTile: { name: 'discovery.tile', concurrency: 4, limiter: { max: 10, duration: 1000 }, notes: 'Google QPS guard' },
  discoveryDetails: { name: 'discovery.details', concurrency: 6, limiter: { max: 10, duration: 1000 } },
  qualificationProbe: { name: 'qualification.probe', concurrency: 8, limiter: { max: 20, duration: 1000 }, notes: 'Website-absence probe' },
  enrichmentEmail: { name: 'enrichment.email', concurrency: 4, notes: 'per-provider limits enforced in adapters' },
  enrichmentVerify: { name: 'enrichment.verify', concurrency: 8, notes: 'per-provider limits enforced in adapters' },
  profilingClassify: { name: 'profiling.classify', concurrency: 4, limiter: { max: 20, duration: 60_000 }, notes: 'LLM' },
  generatorBuild: { name: 'generator.build', concurrency: 2, notes: 'CPU heavy' },
  previewPublish: { name: 'preview.publish', concurrency: 4 },
  outreachSend: { name: 'outreach.send', concurrency: 1, notes: 'serialised per mailbox via group lock' },
  outreachIngest: { name: 'outreach.ingest', concurrency: 2, notes: 'IMAP/webhook poll' },
  maintenancePurge: { name: 'maintenance.purge', concurrency: 1, notes: 'cron 03:00: snapshot expiry, retention' },
} as const satisfies Record<string, QueueSpec>;

export type QueueKey = keyof typeof QUEUES;
export const QUEUE_NAMES = Object.values(QUEUES).map((q) => q.name);
export const KILL_SWITCH_KEY = 'ops:killswitch';
