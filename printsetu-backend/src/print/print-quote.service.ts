import { Injectable } from '@nestjs/common';
import { DocumentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService, ResolvedRate, comboKey } from '../pricing/pricing.service';
import {
  AppNotFoundException,
  InvalidPrintOptionException,
  ShopAccessDeniedException,
  UnsupportedDocumentException,
} from '../common/exceptions/app.exceptions';
import { CreateQuoteDto } from './dto/print.dto';
import { StatusTokenClaims } from '../common/types/request-context';

const QUOTE_TTL_SECONDS = 15 * 60;

type QuoteItemCalc = Prisma.PrintQuoteItemUncheckedCreateWithoutQuoteInput;

@Injectable()
export class PrintQuoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
  ) {}

  /**
   * SRS §17.1 example generalized to N documents: billablePages =
   * pageCount * copies PER document (each can have its own paper/color/
   * side/copies), summed into one quote total. Quantity tiers are chosen by
   * the order's total billable pages per paper/color/side combination, and
   * that one rate is applied to every document in the combination.
   */
  async createQuote(dto: CreateQuoteDto, claims: StatusTokenClaims) {
    if (!claims.sessionId) {
      throw new ShopAccessDeniedException(
        "This link has expired. Please scan the shop's QR code again.",
      );
    }

    const documentIds = dto.items.map((item) => item.documentId);
    if (new Set(documentIds).size !== documentIds.length) {
      throw new InvalidPrintOptionException(
        'Each document can only appear once in a quote request.',
      );
    }

    const documents = await this.prisma.document.findMany({ where: { id: { in: documentIds } } });
    const documentsById = new Map(documents.map((d) => [d.id, d]));

    const lines: {
      line: CreateQuoteDto['items'][number];
      pageCount: number;
      billablePages: number;
    }[] = [];

    for (const line of dto.items) {
      const document = documentsById.get(line.documentId);
      if (!document) throw new AppNotFoundException(`Document ${line.documentId} not found.`);
      if (claims.sessionId !== document.sessionId || claims.shopId !== document.shopId) {
        throw new ShopAccessDeniedException(
          "This link has expired. Please scan the shop's QR code again.",
        );
      }
      if (document.status === DocumentStatus.DELETED) {
        throw new AppNotFoundException('Document has been deleted.');
      }
      if (!document.pageCount || document.status === DocumentStatus.ANALYSIS_FAILED) {
        throw new UnsupportedDocumentException(
          `"${document.originalName}" is still being checked. Please wait a moment and try again.`,
        );
      }

      // SRS §16.1: "documents 1->N print_jobs only if controlled reprint is
      // allowed; otherwise enforce one active print lifecycle."  Phase 1
      // does not implement controlled reprint, so block a second concurrent
      // order against the same document.
      const activeJobItem = await this.prisma.printJobItem.findFirst({
        where: {
          documentId: document.id,
          printJob: { status: { notIn: ['PRINT_FAILED', 'CANCELLED', 'DELETED'] } },
        },
      });
      if (activeJobItem) {
        throw new InvalidPrintOptionException(
          `"${document.originalName}" already has an active print job.`,
        );
      }

      lines.push({
        line,
        pageCount: document.pageCount,
        billablePages: document.pageCount * line.copies,
      });
    }

    // Pricing off (the default): no rate is looked up, so every option is
    // accepted and the order is recorded unpriced with a zero amount.
    const priced = await this.pricingService.isPricingEnabled(claims.shopId);

    const pagesByCombo = new Map<string, number>();
    for (const { line, billablePages } of lines) {
      pagesByCombo.set(comboKey(line), (pagesByCombo.get(comboKey(line)) ?? 0) + billablePages);
    }
    const rateByCombo = new Map<string, ResolvedRate>();
    if (priced) {
      for (const { line } of lines) {
        const key = comboKey(line);
        if (rateByCombo.has(key)) continue;
        rateByCombo.set(
          key,
          await this.pricingService.resolveRate(claims.shopId, line, pagesByCombo.get(key)!),
        );
      }
    }

    const items: QuoteItemCalc[] = [];
    let totalAmount = 0;

    for (const { line, pageCount, billablePages } of lines) {
      const key = comboKey(line);
      const rate = rateByCombo.get(key);
      const amount = rate ? rate.pricePerPage * billablePages : 0;
      totalAmount += amount;

      items.push({
        documentId: line.documentId,
        paperSize: line.paperSize,
        colorMode: line.colorMode,
        sideMode: line.sideMode,
        copies: line.copies,
        pageCount,
        billablePages,
        amount,
        pricingSnapshot: rate
          ? {
              pricingId: rate.pricingId,
              pricePerPage: rate.pricePerPage.toFixed(2),
              basePricePerPage: rate.basePricePerPage.toFixed(2),
              paperSize: line.paperSize,
              colorMode: line.colorMode,
              sideMode: line.sideMode,
              effectiveFrom: rate.effectiveFrom,
              comboBillablePages: pagesByCombo.get(key)!,
              tier: rate.tier,
            }
          : {
              priced: false,
              paperSize: line.paperSize,
              colorMode: line.colorMode,
              sideMode: line.sideMode,
            },
      });
    }

    const quote = await this.prisma.printQuote.create({
      data: {
        sessionId: claims.sessionId,
        amount: totalAmount,
        priced,
        currency: 'INR',
        expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000),
        items: { create: items },
      },
      include: { items: true },
    });

    return {
      quoteId: quote.id,
      items: quote.items.map((item) => ({
        documentId: item.documentId,
        pageCount: item.pageCount,
        billablePages: item.billablePages,
        amount: item.amount.toFixed(2),
      })),
      amount: totalAmount.toFixed(2),
      priced,
      currency: quote.currency,
      expiresAt: quote.expiresAt.toISOString(),
    };
  }
}
