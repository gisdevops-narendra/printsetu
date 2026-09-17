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

describe('PrintQuoteService (SRS §17.1 price quote example)', () => {
  let service: PrintQuoteService;
  let prisma: {
    document: { findUnique: jest.Mock };
    printJob: { findFirst: jest.Mock };
    printQuote: { create: jest.Mock };
  };
  let pricingService: { getActiveRateOrThrow: jest.Mock };

  const claims = { shopId: 'shop-1', documentId: 'doc-1', exp: 9999999999 };
  const baseDocument = {
    id: 'doc-1',
    shopId: 'shop-1',
    pageCount: 10,
    status: 'PROCESSED',
  };

  beforeEach(async () => {
    prisma = {
      document: { findUnique: jest.fn().mockResolvedValue(baseDocument) },
      printJob: { findFirst: jest.fn().mockResolvedValue(null) },
      printQuote: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'quote-1',
            currency: data.currency,
            expiresAt: new Date('2026-01-01T00:15:00.000Z'),
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
    const result = await service.createQuote(
      { documentId: 'doc-1', paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 2 },
      claims,
    );

    expect(result.pageCount).toBe(10);
    expect(result.billablePages).toBe(20);
    expect(result.amount).toBe('40.00');
  });

  it('rejects when the status token does not match the document/shop', async () => {
    await expect(
      service.createQuote(
        { documentId: 'doc-1', paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 1 },
        { ...claims, shopId: 'shop-2' },
      ),
    ).rejects.toThrow(ShopAccessDeniedException);
  });

  it('rejects when the document does not exist', async () => {
    prisma.document.findUnique.mockResolvedValue(null);
    await expect(
      service.createQuote(
        { documentId: 'doc-1', paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 1 },
        claims,
      ),
    ).rejects.toThrow(AppNotFoundException);
  });

  it('rejects when page-count analysis never completed', async () => {
    prisma.document.findUnique.mockResolvedValue({ ...baseDocument, pageCount: null });
    await expect(
      service.createQuote(
        { documentId: 'doc-1', paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 1 },
        claims,
      ),
    ).rejects.toThrow(UnsupportedDocumentException);
  });

  it('blocks a second quote while an active print job already exists for the document (one active lifecycle)', async () => {
    prisma.printJob.findFirst.mockResolvedValue({ id: 'existing-job', status: 'QUEUED' });
    await expect(
      service.createQuote(
        { documentId: 'doc-1', paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 1 },
        claims,
      ),
    ).rejects.toThrow(InvalidPrintOptionException);
  });
});
