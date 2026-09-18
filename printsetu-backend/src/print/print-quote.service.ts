import { Injectable } from '@nestjs/common';
import { ColorMode, DocumentStatus, PaperSize, Prisma, SideMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
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
   * side/copies), summed into one quote total.
   */
  async createQuote(dto: CreateQuoteDto, claims: StatusTokenClaims) {
    if (!claims.sessionId) {
      throw new ShopAccessDeniedException('Status token does not grant access to any upload session.');
    }

    const documentIds = dto.items.map((item) => item.documentId);
    if (new Set(documentIds).size !== documentIds.length) {
      throw new InvalidPrintOptionException('Each document can only appear once in a quote request.');
    }

    const documents = await this.prisma.document.findMany({ where: { id: { in: documentIds } } });
    const documentsById = new Map(documents.map((d) => [d.id, d]));

    const items: QuoteItemCalc[] = [];
    let totalAmount = 0;

    for (const line of dto.items) {
      const document = documentsById.get(line.documentId);
      if (!document) throw new AppNotFoundException(`Document ${line.documentId} not found.`);
      if (claims.sessionId !== document.sessionId || claims.shopId !== document.shopId) {
        throw new ShopAccessDeniedException('Status token does not grant access to this document.');
      }
      if (document.status === DocumentStatus.DELETED) {
        throw new AppNotFoundException('Document has been deleted.');
      }
      if (!document.pageCount || document.status === DocumentStatus.ANALYSIS_FAILED) {
        throw new UnsupportedDocumentException(
          `"${document.originalName}" has not finished analysis; cannot calculate a reliable quote.`,
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
        throw new InvalidPrintOptionException(`"${document.originalName}" already has an active print job.`);
      }

      const rate = await this.pricingService.getActiveRateOrThrow(
        document.shopId,
        line.paperSize,
        line.colorMode,
        line.sideMode,
      );

      const billablePages = document.pageCount * line.copies;
      const amount = Number(rate.pricePerPage) * billablePages;
      totalAmount += amount;

      items.push({
        documentId: document.id,
        paperSize: line.paperSize,
        colorMode: line.colorMode,
        sideMode: line.sideMode,
        copies: line.copies,
        pageCount: document.pageCount,
        billablePages,
        amount,
        pricingSnapshot: {
          pricingId: rate.id,
          pricePerPage: rate.pricePerPage.toString(),
          paperSize: rate.paperSize,
          colorMode: rate.colorMode,
          sideMode: rate.sideMode,
          effectiveFrom: rate.effectiveFrom,
        },
      });
    }

    const quote = await this.prisma.printQuote.create({
      data: {
        sessionId: claims.sessionId,
        amount: totalAmount,
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
      currency: quote.currency,
      expiresAt: quote.expiresAt.toISOString(),
    };
  }
}
