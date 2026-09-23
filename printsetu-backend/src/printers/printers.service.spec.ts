import { PrinterStatus } from '@prisma/client';
import { PrintersService } from './printers.service';
import {
  AppNotFoundException,
  InvalidPrintOptionException,
} from '../common/exceptions/app.exceptions';

describe('PrintersService — OS printer selection', () => {
  let service: PrintersService;
  let prisma: { printer: { findUnique: jest.Mock; update: jest.Mock } };
  let connections: { requestPrinterRefresh: jest.Mock };

  const agentPrinter = {
    id: 'printer-1',
    shopId: 'shop-1',
    status: PrinterStatus.ONLINE,
    osPrinterName: null,
    capabilitiesJson: {
      printers: [
        { name: 'HP LaserJet M1005', isDefault: true },
        { name: 'Canon LBP2900', isDefault: false },
      ],
      platform: 'win32',
      hostname: 'SHOP-PC',
      reportedAt: '2026-09-23T08:00:00.000Z',
    },
  };

  beforeEach(() => {
    prisma = {
      printer: {
        findUnique: jest.fn().mockResolvedValue(agentPrinter),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ ...agentPrinter, ...data })),
      },
    };
    connections = { requestPrinterRefresh: jest.fn().mockReturnValue(true) };
    service = new PrintersService(prisma as any, connections as any, {} as any);
  });

  describe('reportPrinters', () => {
    it('stores the reported printer list in capabilitiesJson', async () => {
      await expect(
        service.reportPrinters('printer-1', {
          printers: [{ name: 'Canon_MF240', isDefault: true }],
          platform: 'linux',
          hostname: 'shop-desk',
        }),
      ).resolves.toEqual({ received: 1 });

      expect(prisma.printer.update).toHaveBeenCalledWith({
        where: { id: 'printer-1' },
        data: {
          capabilitiesJson: expect.objectContaining({
            printers: [{ name: 'Canon_MF240', isDefault: true }],
            platform: 'linux',
            hostname: 'shop-desk',
            reportedAt: expect.any(String),
          }),
        },
      });
    });
  });

  describe('selectOsPrinter', () => {
    it('saves a printer the agent reported', async () => {
      const updated = await service.selectOsPrinter('shop-1', 'printer-1', 'Canon LBP2900');

      expect(prisma.printer.update).toHaveBeenCalledWith({
        where: { id: 'printer-1' },
        data: { osPrinterName: 'Canon LBP2900' },
      });
      expect(updated.osPrinterName).toBe('Canon LBP2900');
    });

    it('accepts null to go back to the computer default printer', async () => {
      await service.selectOsPrinter('shop-1', 'printer-1', null);

      expect(prisma.printer.update).toHaveBeenCalledWith({
        where: { id: 'printer-1' },
        data: { osPrinterName: null },
      });
    });

    it('rejects a name the agent never reported', async () => {
      await expect(
        service.selectOsPrinter('shop-1', 'printer-1', 'Print Agent'),
      ).rejects.toBeInstanceOf(InvalidPrintOptionException);
      expect(prisma.printer.update).not.toHaveBeenCalled();
    });

    it("refuses another shop's printer", async () => {
      await expect(service.selectOsPrinter('shop-2', 'printer-1', null)).rejects.toBeInstanceOf(
        AppNotFoundException,
      );
    });

    it('refuses a removed printer', async () => {
      prisma.printer.findUnique.mockResolvedValue({
        ...agentPrinter,
        status: PrinterStatus.REMOVED,
      });

      await expect(service.selectOsPrinter('shop-1', 'printer-1', null)).rejects.toBeInstanceOf(
        AppNotFoundException,
      );
    });
  });

  describe('requestPrinterRefresh', () => {
    it('reports whether the agent was connected to receive the request', async () => {
      await expect(service.requestPrinterRefresh('shop-1', 'printer-1')).resolves.toEqual({
        requested: true,
      });
      expect(connections.requestPrinterRefresh).toHaveBeenCalledWith('printer-1');

      connections.requestPrinterRefresh.mockReturnValue(false);
      await expect(service.requestPrinterRefresh('shop-1', 'printer-1')).resolves.toEqual({
        requested: false,
      });
    });
  });
});
