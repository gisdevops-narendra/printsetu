import { PrintQuoteService } from './print-quote.service';
import { CreateQuoteDto } from './dto/print.dto';
import { StatusTokenClaims } from '../common/types/request-context';
export declare class PrintQuoteController {
    private readonly quoteService;
    constructor(quoteService: PrintQuoteService);
    create(dto: CreateQuoteDto, claims: StatusTokenClaims): Promise<{
        quoteId: string;
        documentId: string;
        pageCount: number;
        billablePages: number;
        amount: string;
        currency: string;
        expiresAt: string;
    }>;
}
