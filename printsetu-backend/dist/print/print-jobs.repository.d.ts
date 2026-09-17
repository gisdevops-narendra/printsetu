import { PrintJobStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export interface TransitionOptions {
    jobId: string;
    from: PrintJobStatus;
    to: PrintJobStatus;
    data?: Record<string, unknown>;
    agentAttemptId?: string;
    message?: string;
}
export declare class PrintJobsRepository {
    private readonly prisma;
    constructor(prisma: PrismaService);
    transition(opts: TransitionOptions): Promise<{
        id: string;
        createdAt: Date;
        shopId: string;
        status: import(".prisma/client").$Enums.PrintJobStatus;
        documentId: string;
        quoteId: string | null;
        updatedAt: Date;
        printerId: string | null;
        optionsJson: import("@prisma/client/runtime/library").JsonValue;
        amount: import("@prisma/client/runtime/library").Decimal;
        currency: string;
        attemptCount: number;
        idempotencyKey: string;
        queuedAt: Date | null;
        printedAt: Date | null;
        failureReason: string | null;
        statusToken: string;
    }>;
}
