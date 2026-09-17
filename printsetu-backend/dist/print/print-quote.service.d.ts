import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { CreateQuoteDto } from './dto/print.dto';
import { StatusTokenClaims } from '../common/types/request-context';
export declare class PrintQuoteService {
    private readonly prisma;
    private readonly pricingService;
    constructor(prisma: PrismaService, pricingService: PricingService);
    createQuote(dto: CreateQuoteDto, claims: StatusTokenClaims): Promise<{
        quoteId: string;
        documentId: string;
        pageCount: number;
        billablePages: number;
        amount: string;
        currency: string;
        expiresAt: string;
    }>;
}
