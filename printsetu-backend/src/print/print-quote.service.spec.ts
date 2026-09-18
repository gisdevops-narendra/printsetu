import { Test } from '@nestjs/testing';
import { PrintQuoteService } from './print-quote.service';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AppNotFoundException,
  InvalidPrintOptionException,
  ShopAccessDeniedException,
  UnsupportedDocumentException,
} from '../common/exceptions/app.exceptions';

describe('PrintQuoteService (SRS §17.1 price quote example, generalized to multiple documents)', () => {
  let service: PrintQuoteService;
  let prisma: {
    document: { findMany: jest.Mock };
    printJobItem: { findFirst: jest.Mock };
    printQuote: { create: jest.Mock };
  };
  let pricingService: { getActiveRateOrThrow: jest.Mock };

  const claims = { shopId: 'shop-1', sessionId: 'session-1', exp: 9999999999 };
  const baseDocument = {
    id: 'doc-1',
    shopId: 'shop-1',
    sessionId: 'session-1',
    originalName: 'resume.pdf',
    pageCount: 10,
    status: 'PROCESSED',
  };
  const item = { documentId: 'doc-1', paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 2 } as const;

  beforeEach(async () => {
    prisma = {
      document: { findMany: jest.fn().mockResolvedValue([baseDocument]) },
      printJobItem: { findFirst: jest.fn().mockResolvedValue(null) },
      printQuote: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'quote-1',
            currency: data.currency,
            expiresAt: new Date('2026-01-01T00:15:00.000Z'),
            items: data.items.create.map((created: any, index: number) => ({
              id: `quote-item-${index}`,
              ...created,
            })),
          }),
        ),
      },
    };
    pricingService = {
      getActiveRateOrThrow: jest.fn().mockResolvedValue({
        id: 'rate-1',
        pricePerPage: 2.0,
        paperSize: 'A4',
        colorMode: 'BW',
        sideMode: 'SIMPLEX',
        effectiveFrom: new Date(),
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PrintQuoteService,
        { provide: PrismaService, useValue: prisma },
        { provide: PricingService, useValue: pricingService },
      ],
    }).compile();

    service = moduleRef.get(PrintQuoteService);
  });

  it('matches the SRS §17.1 documented example exactly (10 pages x 2 copies x ₹2.00 = ₹40.00, billablePages=20)', async () => {
    const result = await service.createQuote({ items: [item] }, claims);

    expect(result.items[0].pageCount).toBe(10);
    expect(result.items[0].billablePages).toBe(20);
    expect(result.items[0].amount).toBe('40.00');
    expect(result.amount).toBe('40.00');
  });

  it('sums line items from multiple documents into one quote total', async () => {
    const secondDocument = { ...baseDocument, id: 'doc-2', originalName: 'photo.jpg', pageCount: 1 };
    prisma.document.findMany.mockResolvedValue([baseDocument, secondDocument]);

    const result = await service.createQuote(
      { items: [item, { documentId: 'doc-2', paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 1 } as const] },
      claims,
    );

    expect(result.items).toHaveLength(2);
    // 20 billable pages + 1 billable page, at ₹2.00/page = ₹42.00
    expect(result.amount).toBe('42.00');
  });

  it('rejects when the status token does not match the document/shop', async () => {
    await expect(
      service.createQuote({ items: [item] }, { ...claims, shopId: 'shop-2' }),
    ).rejects.toThrow(ShopAccessDeniedException);
  });

  it('rejects when the document does not exist', async () => {
    prisma.document.findMany.mockResolvedValue([]);
    await expect(service.createQuote({ items: [item] }, claims)).rejects.toThrow(AppNotFoundException);
  });

  it('rejects when page-count analysis never completed', async () => {
    prisma.document.findMany.mockResolvedValue([{ ...baseDocument, pageCount: null }]);
    await expect(service.createQuote({ items: [item] }, claims)).rejects.toThrow(UnsupportedDocumentException);
  });

  it('blocks a second quote while an active print job already exists for the document (one active lifecycle)', async () => {
    prisma.printJobItem.findFirst.mockResolvedValue({ id: 'existing-item', printJobId: 'existing-job' });
    await expect(service.createQuote({ items: [item] }, claims)).rejects.toThrow(InvalidPrintOptionException);
  });

  it('rejects a request that lists the same document twice', async () => {
    await expect(service.createQuote({ items: [item, item] }, claims)).rejects.toThrow(InvalidPrintOptionException);
  });
});
