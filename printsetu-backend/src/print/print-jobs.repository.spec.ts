import { Test } from '@nestjs/testing';
import { PrintJobsRepository } from './print-jobs.repository';
import { PrismaService } from '../prisma/prisma.service';
import { JobAlreadyPrintingException } from '../common/exceptions/app.exceptions';

describe('PrintJobsRepository.transition (SRS §13.3 duplicate click / idempotency)', () => {
  let repo: PrintJobsRepository;
  let tx: { printJob: { updateMany: jest.Mock; findUniqueOrThrow: jest.Mock }; printJobEvent: { create: jest.Mock } };
  let prisma: { $transaction: jest.Mock };

  beforeEach(async () => {
    tx = {
      printJob: {
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'job-1', status: 'QUEUED' }),
      },
      printJobEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = { $transaction: jest.fn().mockImplementation((fn) => fn(tx)) };

    const moduleRef = await Test.createTestingModule({
      providers: [PrintJobsRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();

    repo = moduleRef.get(PrintJobsRepository);
  });

  it('rejects an illegal transition before ever touching the database', async () => {
    await expect(
      repo.transition({ jobId: 'job-1', from: 'DELETED', to: 'QUEUED' }),
    ).rejects.toThrow(/Illegal print job transition/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('performs a compare-and-swap update scoped to the expected current status', async () => {
    tx.printJob.updateMany.mockResolvedValue({ count: 1 });

    await repo.transition({ jobId: 'job-1', from: 'PRINT_ELIGIBLE', to: 'QUEUED' });

    expect(tx.printJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-1', status: 'PRINT_ELIGIBLE' },
      data: { status: 'QUEUED' },
    });
    expect(tx.printJobEvent.create).toHaveBeenCalledWith({
      data: { printJobId: 'job-1', status: 'QUEUED', agentAttemptId: undefined, message: undefined },
    });
  });

  it('throws JOB_ALREADY_PRINTING when the row is not in the expected state (the duplicate-click case)', async () => {
    // Simulates two concurrent PRINT clicks: the first already moved the
    // job out of PRINT_ELIGIBLE, so this CAS update matches zero rows.
    tx.printJob.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repo.transition({ jobId: 'job-1', from: 'PRINT_ELIGIBLE', to: 'QUEUED' }),
    ).rejects.toThrow(JobAlreadyPrintingException);
    expect(tx.printJobEvent.create).not.toHaveBeenCalled();
  });
});
