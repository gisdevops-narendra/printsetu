import { PrintJobsService } from './print-jobs.service';
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
  let storage: { getSignedDownloadUrl: jest.Mock };
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
    storage = { getSignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example/file') };
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
});
