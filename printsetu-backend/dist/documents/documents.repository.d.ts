import { DocumentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export interface DocumentTransitionOptions {
    documentId: string;
    from: DocumentStatus;
    to: DocumentStatus;
    data?: Record<string, unknown>;
}
export declare class DocumentsRepository {
    private readonly prisma;
    constructor(prisma: PrismaService);
    transition(opts: DocumentTransitionOptions): Promise<{
        id: string;
        shopId: string;
        status: import(".prisma/client").$Enums.DocumentStatus;
        pageCount: number | null;
        colorPages: number | null;
        originalName: string;
        s3Key: string;
        mimeType: string;
        sizeBytes: number;
        colorDetectionConfidence: string | null;
        uploadedAt: Date;
        deletedAt: Date | null;
    }>;
}
