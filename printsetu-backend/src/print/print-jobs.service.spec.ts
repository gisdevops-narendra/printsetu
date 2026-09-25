import { PDFDocument, PDFName, PDFNumber } from 'pdf-lib';
import { ValidationPipe } from '@nestjs/common';
import { PrintJobsService } from './print-jobs.service';
import { AgentJobStatusDto } from './dto/print.dto';
import {
  AppNotFoundException,
  InvalidPrintOptionException,
} from '../common/exceptions/app.exceptions';

describe('PrintJobsService — shop document editor (reorder/delete/settings) + edited-file dispatch', () => {
  let service: PrintJobsService;
  let prisma: {
    printJob: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; update: jest.Mock };
    printJobItem: { update: jest.Mock; delete: jest.Mock; findMany: jest.Mock };
    document: { update: jest.Mock };
    $transaction: jest.Mock;
  };
  let pricingService: {
    getActiveRateOrThrow: jest.Mock;
    resolveRate: jest.Mock;
    isPricingEnabled: jest.Mock;
  };
  let storage: { getSignedDownloadUrl: jest.Mock; getObject: jest.Mock; putObject: jest.Mock };
  let plainPdf: Buffer;

  beforeAll(async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText('hello');
    plainPdf = Buffer.from(await pdf.save());
  });
  let agentConnections: { isConnected: jest.Mock; pushJob: jest.Mock };

  const eligibleJob = {
    id: 'job-1',
    shopId: 'shop-1',
    status: 'PRINT_ELIGIBLE',
    priced: true,
    items: [
      {
        id: 'item-1',
        documentId: 'doc-1',
        paperSize: 'A4',
        colorMode: 'BW',
        sideMode: 'SIMPLEX',
        copies: 1,
        pageCount: 5,
        billablePages: 5,
        amount: 10,
      },
      {
        id: 'item-2',
        documentId: 'doc-2',
        paperSize: 'A4',
        colorMode: 'BW',
        sideMode: 'SIMPLEX',
        copies: 1,
        pageCount: 3,
        billablePages: 3,
        amount: 6,
      },
    ],
  };

  beforeEach(() => {
    prisma = {
      printJob: {
        findUnique: jest.fn().mockResolvedValue(eligibleJob),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      printJobItem: {
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue(eligibleJob.items),
      },
      document: { update: jest.fn().mockResolvedValue({}) },
      // Support both $transaction([...]) (array of promises) and
      // $transaction(async tx => ...) (callback) call shapes, threading the
      // same mock through as the tx client — fine for these unit tests.
      $transaction: jest.fn((arg: unknown) =>
        Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma),
      ),
    };
    pricingService = {
      getActiveRateOrThrow: jest.fn().mockResolvedValue({ pricePerPage: 2 }),
      isPricingEnabled: jest.fn().mockResolvedValue(true),
      resolveRate: jest.fn().mockResolvedValue({ pricePerPage: 2, hasTiers: false, tier: null }),
    };
    storage = {
      getSignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example/file'),
      getObject: jest.fn().mockImplementation(async () => plainPdf),
      putObject: jest.fn().mockResolvedValue(undefined),
    };
    agentConnections = { isConnected: jest.fn().mockReturnValue(true), pushJob: jest.fn() };

    service = new PrintJobsService(
      prisma as any,
      {} as any, // PrintJobsRepository — not exercised by these methods
      storage as any,
      agentConnections as any,
      {} as any, // NotificationsService
      {} as any, // AuditService
      pricingService as any,
      {} as any, // ConfigService
      {} as any, // dispatch queue
      { assertShopCanPrint: jest.fn(), assertCustomerCanOrder: jest.fn() } as any, // SubscriptionAccessService
    );
  });

  describe('reorderItems', () => {
    it('rewrites printOrder to match the requested sequence', async () => {
      await service.reorderItems('job-1', 'shop-1', { itemIds: ['item-2', 'item-1'] });

      expect(prisma.printJobItem.update).toHaveBeenCalledWith({
        where: { id: 'item-2' },
        data: { printOrder: 0 },
      });
      expect(prisma.printJobItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { printOrder: 1 },
      });
    });

    it("rejects when the id list does not exactly match the job's current items", async () => {
      await expect(
        service.reorderItems('job-1', 'shop-1', { itemIds: ['item-1'] }),
      ).rejects.toThrow(InvalidPrintOptionException);
    });

    it('rejects once the job has left PRINT_ELIGIBLE', async () => {
      prisma.printJob.findUnique.mockResolvedValue({ ...eligibleJob, status: 'QUEUED' });
      await expect(
        service.reorderItems('job-1', 'shop-1', { itemIds: ['item-1', 'item-2'] }),
      ).rejects.toThrow(InvalidPrintOptionException);
    });

    it('rejects a job belonging to a different shop', async () => {
      await expect(
        service.reorderItems('job-1', 'shop-2', { itemIds: ['item-1', 'item-2'] }),
      ).rejects.toThrow(AppNotFoundException);
    });
  });

  describe('deleteItem', () => {
    it('removes the item, reverts the document to PROCESSED, and recomputes the job amount from what remains', async () => {
      // Simulate the post-delete DB state: only item-2 (amount 6) is left.
      prisma.printJobItem.findMany.mockResolvedValue([eligibleJob.items[1]]);

      await service.deleteItem('job-1', 'shop-1', 'item-1');

      expect(prisma.printJobItem.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: { status: 'PROCESSED' },
      });
      expect(prisma.printJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { amount: 6 },
      });
    });

    it('reprices the remaining items of a tiered combination by the smaller page total', async () => {
      prisma.printJobItem.findMany.mockResolvedValue([eligibleJob.items[1]]);
      pricingService.resolveRate.mockResolvedValue({
        pricePerPage: 2.5,
        hasTiers: true,
        tier: { id: 'tier-low' },
      });

      await service.deleteItem('job-1', 'shop-1', 'item-1');

      expect(pricingService.resolveRate).toHaveBeenCalledWith(
        'shop-1',
        expect.objectContaining({ colorMode: 'BW' }),
        3,
      );
      expect(prisma.printJobItem.update).toHaveBeenCalledWith({
        where: { id: 'item-2' },
        data: { amount: 7.5 },
      });
    });

    it('leaves the remaining items at their quoted price when the combination has no tiers', async () => {
      prisma.printJobItem.findMany.mockResolvedValue([eligibleJob.items[1]]);

      await service.deleteItem('job-1', 'shop-1', 'item-1');

      expect(prisma.printJobItem.update).not.toHaveBeenCalled();
    });

    it('refuses to remove the only document in a job', async () => {
      prisma.printJob.findUnique.mockResolvedValue({
        ...eligibleJob,
        items: [eligibleJob.items[0]],
      });
      await expect(service.deleteItem('job-1', 'shop-1', 'item-1')).rejects.toThrow(
        InvalidPrintOptionException,
      );
    });
  });

  describe('updateItemSettings', () => {
    it('changes an unpriced order without needing a rate or repricing', async () => {
      prisma.printJob.findUnique.mockResolvedValue({ ...eligibleJob, priced: false });

      await service.updateItemSettings('job-1', 'shop-1', 'item-1', { colorMode: 'COLOR' });

      expect(pricingService.getActiveRateOrThrow).not.toHaveBeenCalled();
      expect(pricingService.resolveRate).not.toHaveBeenCalled();
      expect(prisma.printJobItem.update).toHaveBeenCalledTimes(1);
      expect(prisma.printJob.update).not.toHaveBeenCalled();
    });

    it('does not reprice a priced order once the shop has turned pricing off', async () => {
      pricingService.isPricingEnabled.mockResolvedValue(false);

      await service.updateItemSettings('job-1', 'shop-1', 'item-1', { copies: 3 });

      expect(pricingService.getActiveRateOrThrow).not.toHaveBeenCalled();
      expect(pricingService.resolveRate).not.toHaveBeenCalled();
    });

    it('reprices the item against the active rate and rolls the change into the job total', async () => {
      const updatedItem1 = { ...eligibleJob.items[0], copies: 3, billablePages: 15 };
      prisma.printJobItem.findMany.mockResolvedValue([updatedItem1, eligibleJob.items[1]]);

      await service.updateItemSettings('job-1', 'shop-1', 'item-1', { copies: 3 });

      expect(pricingService.getActiveRateOrThrow).toHaveBeenCalledWith(
        'shop-1',
        'A4',
        'BW',
        'SIMPLEX',
      );
      expect(prisma.printJobItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: {
          paperSize: 'A4',
          colorMode: 'BW',
          sideMode: 'SIMPLEX',
          copies: 3,
          billablePages: 15,
        },
      });
      // pageCount 5 * copies 3 = 15 billable pages * ₹2.00/page = ₹30
      expect(prisma.printJobItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { amount: 30 },
      });
      // No tiers: the untouched item keeps its quoted price.
      expect(prisma.printJobItem.update).not.toHaveBeenCalledWith({
        where: { id: 'item-2' },
        data: expect.anything(),
      });
    });

    it('moves every item in the combination to the tier the new page total falls into', async () => {
      const updatedItem1 = { ...eligibleJob.items[0], copies: 3, billablePages: 15 };
      prisma.printJobItem.findMany.mockResolvedValue([updatedItem1, eligibleJob.items[1]]);
      pricingService.resolveRate.mockResolvedValue({
        pricePerPage: 1,
        hasTiers: true,
        tier: { id: 'tier-high' },
      });

      await service.updateItemSettings('job-1', 'shop-1', 'item-1', { copies: 3 });

      // 15 + 3 = 18 pages in A4/BW/SIMPLEX
      expect(pricingService.resolveRate).toHaveBeenCalledWith(
        'shop-1',
        expect.objectContaining({ colorMode: 'BW' }),
        18,
      );
      expect(prisma.printJobItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { amount: 15 },
      });
      expect(prisma.printJobItem.update).toHaveBeenCalledWith({
        where: { id: 'item-2' },
        data: { amount: 3 },
      });
    });
  });

  describe('dispatchToAgent — printing the edited file', () => {
    it('signs renderedS3Key when an item has been edited, and falls back to the original document key otherwise', async () => {
      prisma.printJob.findUniqueOrThrow.mockResolvedValue({
        id: 'job-1',
        status: 'QUEUED',
        printerId: 'printer-1',
        attemptCount: 0,
        items: [
          {
            documentId: 'doc-1',
            renderedS3Key: 'shop-1/doc-1/edits/item-1-123.jpg',
            paperSize: 'A4',
            colorMode: 'BW',
            sideMode: 'SIMPLEX',
            copies: 1,
            document: {
              originalName: 'a.jpg',
              mimeType: 'image/jpeg',
              s3Key: 'shop-1/doc-1/a.jpg',
            },
          },
          {
            documentId: 'doc-2',
            renderedS3Key: null,
            paperSize: 'A4',
            colorMode: 'BW',
            sideMode: 'SIMPLEX',
            copies: 1,
            document: {
              originalName: 'b.pdf',
              mimeType: 'application/pdf',
              s3Key: 'shop-1/doc-2/b.pdf',
            },
          },
        ],
      });

      await service.dispatchToAgent('job-1');

      expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(
        'shop-1/doc-1/edits/item-1-123.jpg',
      );
      expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith('shop-1/doc-2/b.pdf');
      expect(storage.putObject).not.toHaveBeenCalled();
    });

    const pdfJob = {
      id: 'job-1',
      status: 'QUEUED',
      printerId: 'printer-1',
      attemptCount: 0,
      items: [
        {
          id: 'item-1',
          documentId: 'doc-1',
          renderedS3Key: null,
          paperSize: 'A4',
          colorMode: 'BW',
          sideMode: 'SIMPLEX',
          copies: 1,
          document: {
            id: 'doc-1',
            shopId: 'shop-1',
            originalName: 'a.pdf',
            mimeType: 'application/pdf',
            s3Key: 'shop-1/doc-1/a.pdf',
          },
        },
      ],
    };

    it('prints a print-ready copy of a PDF whose on-screen text would not print', async () => {
      const pdf = await PDFDocument.create();
      const page = pdf.addPage();
      const ap = pdf.context.register(
        pdf.context.stream('', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 20] }),
      );
      const annot = pdf.context.obj({
        Type: 'Annot',
        Subtype: 'FreeText',
        Rect: [50, 700, 150, 720],
        AP: { N: ap },
      });
      page.node.set(PDFName.of('Annots'), pdf.context.obj([pdf.context.register(annot)]));
      storage.getObject.mockResolvedValue(Buffer.from(await pdf.save()));
      prisma.printJob.findUniqueOrThrow.mockResolvedValue(pdfJob);

      await service.dispatchToAgent('job-1');

      expect(storage.getObject).toHaveBeenCalledWith('shop-1/doc-1/a.pdf');
      expect(storage.putObject).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'shop-1/doc-1/print-ready/item-1.pdf',
          contentType: 'application/pdf',
        }),
      );
      expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(
        'shop-1/doc-1/print-ready/item-1.pdf',
      );
      const printed = await PDFDocument.load(storage.putObject.mock.calls[0][0].body);
      const flags = printed.getPage(0).node.lookup(PDFName.of('Annots')) as any;
      expect((flags.lookup(0).lookup(PDFName.of('F')) as PDFNumber).asNumber() & 4).toBe(4);
    });

    it('sends the stored PDF unchanged when it cannot be read', async () => {
      storage.getObject.mockRejectedValue(new Error('storage down'));
      prisma.printJob.findUniqueOrThrow.mockResolvedValue(pdfJob);

      await service.dispatchToAgent('job-1');

      expect(storage.putObject).not.toHaveBeenCalled();
      expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith('shop-1/doc-1/a.pdf');
      expect(agentConnections.pushJob).toHaveBeenCalled();
    });
  });

  describe('dispatchToAgent — target OS printer', () => {
    const queuedJob = (printer: { osPrinterName: string | null } | null) => ({
      id: 'job-1',
      status: 'QUEUED',
      printerId: 'printer-1',
      attemptCount: 2,
      printer,
      items: [
        {
          documentId: 'doc-1',
          renderedS3Key: null,
          paperSize: 'A4',
          colorMode: 'BW',
          sideMode: 'SIMPLEX',
          copies: 1,
          document: {
            originalName: 'a.pdf',
            mimeType: 'application/pdf',
            s3Key: 'shop-1/doc-1/a.pdf',
          },
        },
      ],
    });

    it("sends the shopkeeper's chosen OS printer with the job", async () => {
      prisma.printJob.findUniqueOrThrow.mockResolvedValue(
        queuedJob({ osPrinterName: 'HP LaserJet M1005' }),
      );

      await service.dispatchToAgent('job-1');

      expect(agentConnections.pushJob).toHaveBeenCalledWith(
        'printer-1',
        expect.objectContaining({
          jobId: 'job-1',
          attemptId: 'job-1:2',
          printerName: 'HP LaserJet M1005',
        }),
      );
    });

    it('sends null when no OS printer was chosen, letting the agent use its default', async () => {
      prisma.printJob.findUniqueOrThrow.mockResolvedValue(queuedJob({ osPrinterName: null }));

      await service.dispatchToAgent('job-1');

      expect(agentConnections.pushJob).toHaveBeenCalledWith(
        'printer-1',
        expect.objectContaining({ printerName: null }),
      );
    });
  });

  describe('reportAgentStatus — Printer App progress reports', () => {
    let repo: { transition: jest.Mock };
    let notifications: { record: jest.Mock };

    beforeEach(() => {
      repo = {
        transition: jest
          .fn()
          .mockImplementation(({ jobId, to }) => Promise.resolve({ id: jobId, status: to })),
      };
      notifications = { record: jest.fn().mockResolvedValue(undefined) };
      service = new PrintJobsService(
        prisma as any,
        repo as any,
        storage as any,
        agentConnections as any,
        notifications as any,
        { log: jest.fn().mockResolvedValue(undefined) } as any, // AuditService
        pricingService as any,
        {} as any,
        {} as any,
        { assertShopCanPrint: jest.fn(), assertCustomerCanOrder: jest.fn() } as any,
      );
    });

    const jobIn = (status: string) =>
      prisma.printJob.findUnique.mockResolvedValue({
        id: 'job-1',
        shopId: 'shop-1',
        printerId: 'printer-1',
        status,
      });

    it('accepts a job the polling fallback handed out while it was AGENT_OFFLINE (back to QUEUED, then PRINTING)', async () => {
      jobIn('AGENT_OFFLINE');

      const res = await service.reportAgentStatus('job-1', 'printer-1', {
        status: 'ACCEPTED',
        agentAttemptId: 'job-1:1',
      });

      expect(repo.transition.mock.calls.map(([o]) => `${o.from}->${o.to}`)).toEqual([
        'AGENT_OFFLINE->QUEUED',
        'QUEUED->PRINTING',
      ]);
      expect(res.status).toBe('PRINTING');
    });

    it('still lets an AGENT_OFFLINE job be reported failed directly', async () => {
      jobIn('AGENT_OFFLINE');

      await service.reportAgentStatus('job-1', 'printer-1', {
        status: 'PRINT_FAILED',
        agentAttemptId: 'job-1:1',
        message: 'jam',
      });

      expect(repo.transition.mock.calls.map(([o]) => `${o.from}->${o.to}`)).toEqual([
        'AGENT_OFFLINE->PRINT_FAILED',
      ]);
      expect(notifications.record).toHaveBeenCalledWith('shop-1', 'job-1', 'PRINT_FAILED');
    });

    it('treats a repeated PRINTING report as a no-op', async () => {
      jobIn('PRINTING');
      await service.reportAgentStatus('job-1', 'printer-1', {
        status: 'PRINTING',
        agentAttemptId: 'job-1:1',
      });
      expect(repo.transition).not.toHaveBeenCalled();
    });

    it('refuses a report from a different printer', async () => {
      jobIn('QUEUED');
      await expect(
        service.reportAgentStatus('job-1', 'printer-2', {
          status: 'ACCEPTED',
          agentAttemptId: 'job-1:1',
        }),
      ).rejects.toThrow(AppNotFoundException);
    });

    it("stores the Printer App's reason and technical details on a failed order", async () => {
      jobIn('PRINTING');
      await service.reportAgentStatus('job-1', 'printer-1', {
        status: 'PRINT_FAILED',
        agentAttemptId: 'job-1:1',
        message: 'The printer "HP" is offline.',
        errorCode: 'PRINTER_OFFLINE',
        errorDetail: 'stage=print | exit code 1',
      });
      const reason =
        'The printer "HP" is offline.\n\nTechnical details: [PRINTER_OFFLINE] stage=print | exit code 1';
      expect(repo.transition).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'PRINT_FAILED',
          message: reason,
          data: { failureReason: reason },
        }),
      );
    });

    it('records a reason for an uncertain print too, and clears it once the order prints', async () => {
      jobIn('PRINTING');
      await service.reportAgentStatus('job-1', 'printer-1', {
        status: 'PRINT_UNKNOWN',
        agentAttemptId: 'job-1:1',
        message: 'Timed out',
      });
      expect(repo.transition).toHaveBeenLastCalledWith(
        expect.objectContaining({ to: 'PRINT_UNKNOWN', data: { failureReason: 'Timed out' } }),
      );

      jobIn('PRINTING');
      await service.reportAgentStatus('job-1', 'printer-1', {
        status: 'PRINTED',
        agentAttemptId: 'job-1:2',
      });
      expect(repo.transition).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'PRINTED',
          data: expect.objectContaining({ failureReason: null }),
        }),
      );
    });

    it('still records something when an agent sends no reason', async () => {
      jobIn('PRINTING');
      await service.reportAgentStatus('job-1', 'printer-1', {
        status: 'PRINT_FAILED',
        agentAttemptId: 'job-1:1',
      });
      expect(repo.transition).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { failureReason: 'The Printer App did not say why printing failed.' },
        }),
      );
    });

    it('a shop confirming an uncertain print as printed sends it on to document cleanup', async () => {
      prisma.printJob.findUnique.mockResolvedValue({
        id: 'job-1',
        shopId: 'shop-1',
        status: 'PRINT_UNKNOWN',
      });

      const res = await service.reconcile('job-1', 'shop-1', { outcome: 'PRINTED' });

      expect(repo.transition.mock.calls.map(([o]) => `${o.from}->${o.to}`)).toEqual([
        'PRINT_UNKNOWN->PRINTED',
        'PRINTED->RETENTION_PENDING',
      ]);
      expect(notifications.record).toHaveBeenCalledWith('shop-1', 'job-1', 'PRINT_COMPLETED');
      expect(res.status).toBe('RETENTION_PENDING');
    });

    it('a shop marking an uncertain print as failed records the failure (and it can be printed again)', async () => {
      prisma.printJob.findUnique.mockResolvedValue({
        id: 'job-1',
        shopId: 'shop-1',
        status: 'PRINT_UNKNOWN',
      });

      const res = await service.reconcile('job-1', 'shop-1', { outcome: 'PRINT_FAILED' });

      expect(res.status).toBe('PRINT_FAILED');
      expect(notifications.record).toHaveBeenCalledWith('shop-1', 'job-1', 'PRINT_FAILED');
      expect(prisma.printJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { failureReason: 'Marked as not printed by the shop' },
      });
    });

    it('only uncertain orders can be reconciled', async () => {
      prisma.printJob.findUnique.mockResolvedValue({
        id: 'job-1',
        shopId: 'shop-1',
        status: 'PRINTING',
      });
      await expect(service.reconcile('job-1', 'shop-1', { outcome: 'PRINTED' })).rejects.toThrow(
        InvalidPrintOptionException,
      );
    });
  });

  it('Print Orders keeps failed orders so the shop can press PRINT again', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    (prisma.printJob as any).findMany = findMany;

    await service.shopQueue('shop-1');

    const open = findMany.mock.calls[0][0].where.OR[0].status.in;
    expect(open).toEqual(
      expect.arrayContaining(['PRINT_ELIGIBLE', 'AGENT_OFFLINE', 'PRINT_UNKNOWN', 'PRINT_FAILED']),
    );
  });
});

describe('AgentJobStatusDto — survives the global ValidationPipe', () => {
  // main.ts runs ValidationPipe({ whitelist: true }), which drops undecorated
  // properties — the failure reason used to vanish there before reaching the service.
  it('keeps message, errorCode and errorDetail', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    });
    const body = {
      status: 'PRINT_FAILED',
      agentAttemptId: 'a-1',
      message: 'The printer "HP" is offline.',
      errorCode: 'PRINTER_OFFLINE',
      errorDetail: 'exit code 1',
    };
    const out = await pipe.transform(body, { type: 'body', metatype: AgentJobStatusDto });
    expect(out).toEqual(expect.objectContaining(body));
  });
});
