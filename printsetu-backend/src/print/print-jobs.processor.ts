import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrintJobsService } from './print-jobs.service';
import { PRINT_DISPATCH_QUEUE } from './print-queue.constants';

/**
 * BullMQ worker for print-job dispatch (SRS §13: "Job processing, retries
 * and progress tracking are managed through a Redis-backed BullMQ
 * queue"). Retries/backoff are configured on the job at enqueue time in
 * PrintJobsService.triggerPrint; this processor just performs one
 * dispatch attempt per invocation.
 */
@Processor(PRINT_DISPATCH_QUEUE)
export class PrintJobsProcessor extends WorkerHost {
  private readonly logger = new Logger(PrintJobsProcessor.name);

  constructor(private readonly printJobsService: PrintJobsService) {
    super();
  }

  async process(job: Job<{ printJobId: string }>): Promise<void> {
    this.logger.log(`Dispatch attempt ${job.attemptsMade + 1} for print job ${job.data.printJobId}`);
    await this.printJobsService.dispatchToAgent(job.data.printJobId);
  }
}
