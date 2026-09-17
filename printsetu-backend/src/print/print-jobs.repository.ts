import { Injectable } from '@nestjs/common';
import { PrintJobStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JobAlreadyPrintingException } from '../common/exceptions/app.exceptions';
import { ALLOWED_TRANSITIONS, canTransition } from './print-job-state-machine';

export interface TransitionOptions {
  jobId: string;
  from: PrintJobStatus;
  to: PrintJobStatus;
  data?: Record<string, unknown>;
  agentAttemptId?: string;
  message?: string;
}

@Injectable()
export class PrintJobsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compare-and-swap transition: the WHERE clause pins the expected
   * current status, so two concurrent requests (e.g. a duplicate PRINT
   * click — SRS §13.3) can never both succeed. The loser gets
   * JobAlreadyPrintingException instead of corrupting state.
   */
  async transition(opts: TransitionOptions) {
    if (!canTransition(opts.from, opts.to)) {
      throw new Error(
        `Illegal print job transition ${opts.from} -> ${opts.to}. Allowed: ${ALLOWED_TRANSITIONS[opts.from]?.join(', ')}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.printJob.updateMany({
        where: { id: opts.jobId, status: opts.from },
        data: { status: opts.to, ...opts.data },
      });
      if (result.count === 0) {
        throw new JobAlreadyPrintingException(
          `Job is not in ${opts.from} state (concurrent update or duplicate action).`,
        );
      }
      await tx.printJobEvent.create({
        data: {
          printJobId: opts.jobId,
          status: opts.to,
          agentAttemptId: opts.agentAttemptId,
          message: opts.message,
        },
      });
      return tx.printJob.findUniqueOrThrow({ where: { id: opts.jobId } });
    });
  }
}
