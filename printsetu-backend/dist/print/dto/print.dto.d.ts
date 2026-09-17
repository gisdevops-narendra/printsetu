import { ColorMode, PaperSize, SideMode } from '@prisma/client';
export declare class CreateQuoteDto {
    documentId: string;
    paperSize: PaperSize;
    colorMode: ColorMode;
    sideMode: SideMode;
    copies: number;
}
export declare class ConfirmPrintJobDto {
    quoteId: string;
}
export declare class AgentJobStatusDto {
    status: 'ACCEPTED' | 'PRINTING' | 'PRINTED' | 'PRINT_FAILED' | 'PRINT_UNKNOWN';
    agentAttemptId: string;
    message?: string;
}
export declare class ReconcileJobDto {
    outcome: 'PRINTED' | 'PRINT_FAILED';
    message?: string;
}
