import { PrintJobsService } from './print-jobs.service';
import { AppNotFoundException, InvalidPrintOptionException } from '../common/exceptions/app.exceptions';

describe('PrintJobsService — shop document editor (reorder/delete/settings) + edited-file dispatch', () => {
  let service: PrintJobsService;
  let prisma: {
    printJob: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; update: jest.Mock };
    printJobItem: { update: jest.Mock; delete: jest.Mock; findMany: jest.Mock };
    document: { update: jest.Mock };
    $transaction: jest.Mock;
  };
  let pricingService: { getActiveRateOrThrow: jest.Mock };
  let storage: { getSignedDownloadUrl: jest.Mock };
  let agentConnections: { isConnected: jest.Mock; pushJob: jest.Mock };

  const eligibleJob = {
    id: 'job-1',
    shopId: 'shop-1',
    status: 'PRINT_ELIGIBLE',
    items: [
      { id: 'item-1', documentId: 'doc-1', paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 1, pageCount: 5, amount: 10 },
      { id: 'item-2', documentId: 'doc-2', paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 1, pageCount: 3, amount: 6 },
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

      expect(prisma.printJobItem.update).toHaveBeenCalledWith({ where: { id: 'item-2' }, data: { printOrder: 0 } });
      expect(prisma.printJobItem.update).toHaveBeenCalledWith({ where: { id: 'item-1' }, data: { printOrder: 1 } });
    });

    it('rejects when the id list does not exactly match the job\'s current items', async () => {
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
      expect(prisma.printJob.update).toHaveBeenCalledWith({ where: { id: 'job-1' }, data: { amount: 6 } });
    });

    it('refuses to remove the only document in a job', async () => {
      prisma.printJob.findUnique.mockResolvedValue({ ...eligibleJob, items: [eligibleJob.items[0]] });
      await expect(service.deleteItem('job-1', 'shop-1', 'item-1')).rejects.toThrow(InvalidPrintOptionException);
    });
  });

  describe('updateItemSettings', () => {
    it('reprices the item against the active rate and rolls the change into the job total', async () => {
      await service.updateItemSettings('job-1', 'shop-1', 'item-1', { copies: 3 });

      // pageCount 5 * copies 3 = 15 billable pages * ₹2.00/page = ₹30
      expect(pricingService.getActiveRateOrThrow).toHaveBeenCalledWith('shop-1', 'A4', 'BW', 'SIMPLEX');
      expect(prisma.printJobItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 3, billablePages: 15, amount: 30 },
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
            document: { originalName: 'a.jpg', mimeType: 'image/jpeg', s3Key: 'shop-1/doc-1/a.jpg' },
          },
          {
            documentId: 'doc-2',
            renderedS3Key: null,
            paperSize: 'A4',
            colorMode: 'BW',
            sideMode: 'SIMPLEX',
            copies: 1,
            document: { originalName: 'b.pdf', mimeType: 'application/pdf', s3Key: 'shop-1/doc-2/b.pdf' },
          },
        ],
      });

      await service.dispatchToAgent('job-1');

      expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith('shop-1/doc-1/edits/item-1-123.jpg');
      expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith('shop-1/doc-2/b.pdf');
    });
  });
});
