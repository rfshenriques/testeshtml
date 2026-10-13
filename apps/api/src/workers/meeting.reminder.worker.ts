import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUES } from '@sitewright/shared-types';
import { BaseWorker } from './base.worker';
import { SchedulingService } from '../modules/scheduling/scheduling.service';

/** Delayed jobs queued at booking time: confirm requests and reminders before a call with the operator. */
@Processor(QUEUES.meetingReminder.name, { concurrency: QUEUES.meetingReminder.concurrency })
export class MeetingReminderWorker extends BaseWorker {
  constructor(private readonly scheduling: SchedulingService) {
    super();
  }
  process(job: Job<{ meetingId: string; index: number; confirm: boolean; hoursBefore: number }>) {
    return this.run(job, () => this.scheduling.sendReminder(job.data.meetingId, job.data.index, job.data.confirm, job.data.hoursBefore));
  }
}
