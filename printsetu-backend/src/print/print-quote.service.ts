import { Injectable } from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';
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

@Injectable()
export class PrintQuoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
  ) {}

  /** SRS §17.1 example. billablePages = pageCount * copies, matching the documented example exactly. */
  async createQuote(dto: CreateQuoteDto, claims: StatusTokenClaims) {
    const document = await this.prisma.document.findUnique({ where: { id: dto.documentId } });
    if (!document) throw new AppNotFoundException('Document not found.');
    if (claims.documentId !== dto.documentId || claims.shopId !== document.shopId) {
      throw new ShopAccessDeniedException('Status token does not grant access to this document.');
    }
    if (document.status === DocumentStatus.DELETED) {
      throw new AppNotFoundException('Document has been deleted.');
    }
    if (!document.pageCount || document.status === DocumentStatus.ANALYSIS_FAILED) {
      throw new UnsupportedDocumentException(
        'Document analysis did not complete; cannot calculate a reliable quote.',
      );
    }

    // SRS §16.1: "documents 1→N print_jobs only if controlled reprint is
    // allowed; otherwise enforce one active print lifecycle."  Phase 1
    // does not implement controlled reprint, so block a second concurrent
    // order against the same document.
    const activeJob = await this.prisma.printJob.findFirst({
      where: {
        documentId: document.id,
        status: { notIn: ['PRINT_FAILED', 'CANCELLED', 'DELETED'] },
      },
    });
    if (activeJob) {
      throw new InvalidPrintOptionException('This document already has an active print job.');
    }

    const rate = await this.pricingService.getActiveRateOrThrow(
      document.shopId,
      dto.paperSize,
      dto.colorMode,
      dto.sideMode,
    );

    const billablePages = document.pageCount * dto.copies;
    const amount = Number(rate.pricePerPage) * billablePages;

    const quote = await this.prisma.printQuote.create({
      data: {
        documentId: document.id,
        paperSize: dto.paperSize,
        colorMode: dto.colorMode,
        sideMode: dto.sideMode,
        copies: dto.copies,
        pageCount: document.pageCount,
        billablePages,
        amount,
        currency: 'INR',
        pricingSnapshot: {
          pricingId: rate.id,
          pricePerPage: rate.pricePerPage.toString(),
          paperSize: rate.paperSize,
          colorMode: rate.colorMode,
          sideMode: rate.sideMode,
          effectiveFrom: rate.effectiveFrom,
        },
        expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000),
      },
    });

    return {
      quoteId: quote.id,
      documentId: document.id,
      pageCount: document.pageCount,
      billablePages,
      amount: amount.toFixed(2),
      currency: quote.currency,
      expiresAt: quote.expiresAt.toISOString(),
    };
  }
}
