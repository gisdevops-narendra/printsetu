"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrintQuoteService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const pricing_service_1 = require("../pricing/pricing.service");
const app_exceptions_1 = require("../common/exceptions/app.exceptions");
const QUOTE_TTL_SECONDS = 15 * 60;
let PrintQuoteService = class PrintQuoteService {
    constructor(prisma, pricingService) {
        this.prisma = prisma;
        this.pricingService = pricingService;
    }
    async createQuote(dto, claims) {
        const document = await this.prisma.document.findUnique({ where: { id: dto.documentId } });
        if (!document)
            throw new app_exceptions_1.AppNotFoundException('Document not found.');
        if (claims.documentId !== dto.documentId || claims.shopId !== document.shopId) {
            throw new app_exceptions_1.ShopAccessDeniedException('Status token does not grant access to this document.');
        }
        if (document.status === client_1.DocumentStatus.DELETED) {
            throw new app_exceptions_1.AppNotFoundException('Document has been deleted.');
        }
        if (!document.pageCount || document.status === client_1.DocumentStatus.ANALYSIS_FAILED) {
            throw new app_exceptions_1.UnsupportedDocumentException('Document analysis did not complete; cannot calculate a reliable quote.');
        }
        const activeJob = await this.prisma.printJob.findFirst({
            where: {
                documentId: document.id,
                status: { notIn: ['PRINT_FAILED', 'CANCELLED', 'DELETED'] },
            },
        });
        if (activeJob) {
            throw new app_exceptions_1.InvalidPrintOptionException('This document already has an active print job.');
        }
        const rate = await this.pricingService.getActiveRateOrThrow(document.shopId, dto.paperSize, dto.colorMode, dto.sideMode);
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
};
exports.PrintQuoteService = PrintQuoteService;
exports.PrintQuoteService = PrintQuoteService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        pricing_service_1.PricingService])
], PrintQuoteService);
//# sourceMappingURL=print-quote.service.js.map