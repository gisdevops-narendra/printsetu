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
  let pricingService: { resolveRate: jest.Mock; isPricingEnabled: jest.Mock };

  const claims = { shopId: 'shop-1', sessionId: 'session-1', exp: 9999999999 };
  const baseDocument = {
    id: 'doc-1',
    shopId: 'shop-1',
    sessionId: 'session-1',
    originalName: 'resume.pdf',
    pageCount: 10,
    status: 'PROCESSED',
  };
  const item = {
    documentId: 'doc-1',
    paperSize: 'A4',
    colorMode: 'BW',
    sideMode: 'SIMPLEX',
    copies: 2,
  } as const;

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
      isPricingEnabled: jest.fn().mockResolvedValue(true),
      resolveRate: jest.fn().mockResolvedValue({
        pricingId: 'rate-1',
        effectiveFrom: new Date(),
        basePricePerPage: 2,
        pricePerPage: 2,
        hasTiers: false,
        tier: null,
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
    const secondDocument = {
      ...baseDocument,
      id: 'doc-2',
      originalName: 'photo.jpg',
      pageCount: 1,
    };
    prisma.document.findMany.mockResolvedValue([baseDocument, secondDocument]);

    const result = await service.createQuote(
      {
        items: [
          item,
          {
            documentId: 'doc-2',
            paperSize: 'A4',
            colorMode: 'BW',
            sideMode: 'SIMPLEX',
            copies: 1,
          } as const,
        ],
      },
      claims,
    );

    expect(result.items).toHaveLength(2);
    // 20 billable pages + 1 billable page, at ₹2.00/page = ₹42.00
    expect(result.amount).toBe('42.00');
  });

  it('with pricing off, looks up no rate and records an unpriced zero-amount quote', async () => {
    pricingService.isPricingEnabled.mockResolvedValue(false);

    const result = await service.createQuote({ items: [item] }, claims);

    expect(pricingService.resolveRate).not.toHaveBeenCalled();
    expect(result.priced).toBe(false);
    expect(result.amount).toBe('0.00');
    expect(result.items[0].billablePages).toBe(20);
    expect(prisma.printQuote.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ priced: false, amount: 0 }) }),
    );
  });

  it('rejects when the status token does not match the document/shop', async () => {
    await expect(
      service.createQuote({ items: [item] }, { ...claims, shopId: 'shop-2' }),
    ).rejects.toThrow(ShopAccessDeniedException);
  });

  it('rejects when the document does not exist', async () => {
    prisma.document.findMany.mockResolvedValue([]);
    await expect(service.createQuote({ items: [item] }, claims)).rejects.toThrow(
      AppNotFoundException,
    );
  });

  it('rejects when page-count analysis never completed', async () => {
    prisma.document.findMany.mockResolvedValue([{ ...baseDocument, pageCount: null }]);
    await expect(service.createQuote({ items: [item] }, claims)).rejects.toThrow(
      UnsupportedDocumentException,
    );
  });

  it('blocks a second quote while an active print job already exists for the document (one active lifecycle)', async () => {
    prisma.printJobItem.findFirst.mockResolvedValue({
      id: 'existing-item',
      printJobId: 'existing-job',
    });
    await expect(service.createQuote({ items: [item] }, claims)).rejects.toThrow(
      InvalidPrintOptionException,
    );
  });

  it('rejects a request that lists the same document twice', async () => {
    await expect(service.createQuote({ items: [item, item] }, claims)).rejects.toThrow(
      InvalidPrintOptionException,
    );
  });

  describe('quantity tiers', () => {
    // Shop tiers for A4/BW/SIMPLEX: 1–5 pages ₹2, 6+ pages ₹1. COLOR has no tiers (₹10 flat).
    beforeEach(() => {
      pricingService.resolveRate.mockImplementation(
        (_shopId: string, combo: { colorMode: string }, totalPages: number) => {
          if (combo.colorMode === 'COLOR') {
            return Promise.resolve({
              pricingId: 'rate-color',
              effectiveFrom: new Date(),
              basePricePerPage: 10,
              pricePerPage: 10,
              hasTiers: false,
              tier: null,
            });
          }
          const tier =
            totalPages <= 5
              ? { id: 'tier-low', minPages: 1, maxPages: 5, pricePerPage: 2 }
              : { id: 'tier-high', minPages: 6, maxPages: null, pricePerPage: 1 };
          return Promise.resolve({
            pricingId: 'rate-1',
            effectiveFrom: new Date(),
            basePricePerPage: 2,
            pricePerPage: tier.pricePerPage,
            hasTiers: true,
            tier,
          });
        },
      );
    });

    it('picks the tier from the combined pages of every document in the same combination and charges all of them at it', async () => {
      const docA = { ...baseDocument, id: 'doc-a', pageCount: 3 };
      const docB = { ...baseDocument, id: 'doc-b', pageCount: 3 };
      prisma.document.findMany.mockResolvedValue([docA, docB]);

      const result = await service.createQuote(
        {
          items: [
            { ...item, documentId: 'doc-a', copies: 1 },
            { ...item, documentId: 'doc-b', copies: 1 },
          ],
        },
        claims,
      );

      // 3 + 3 = 6 pages -> 6+ tier at ₹1 for every page (not ₹2 for the first 5)
      expect(pricingService.resolveRate).toHaveBeenCalledTimes(1);
      expect(pricingService.resolveRate).toHaveBeenCalledWith(
        'shop-1',
        expect.objectContaining({ colorMode: 'BW' }),
        6,
      );
      expect(result.items.map((i) => i.amount)).toEqual(['3.00', '3.00']);
      expect(result.amount).toBe('6.00');
    });

    it('prices B/W and color separately, each by its own page total', async () => {
      const docA = { ...baseDocument, id: 'doc-a', pageCount: 4 };
      const docB = { ...baseDocument, id: 'doc-b', pageCount: 4 };
      prisma.document.findMany.mockResolvedValue([docA, docB]);

      const result = await service.createQuote(
        {
          items: [
            { ...item, documentId: 'doc-a', copies: 1 },
            { ...item, documentId: 'doc-b', colorMode: 'COLOR', copies: 1 },
          ],
        },
        claims,
      );

      // BW: 4 pages -> 1–5 tier ₹2 = ₹8; COLOR: 4 pages x ₹10 = ₹40
      expect(result.items.map((i) => i.amount)).toEqual(['8.00', '40.00']);
      expect(result.amount).toBe('48.00');
    });

    it('snapshots the tier and the combination page total into each quote item', async () => {
      await service.createQuote({ items: [item] }, claims);

      const created = prisma.printQuote.create.mock.calls[0][0].data.items.create[0];
      expect(created.pricingSnapshot).toEqual(
        expect.objectContaining({
          pricePerPage: '1.00',
          basePricePerPage: '2.00',
          comboBillablePages: 20,
          tier: { id: 'tier-high', minPages: 6, maxPages: null, pricePerPage: 1 },
        }),
      );
    });
  });
});
