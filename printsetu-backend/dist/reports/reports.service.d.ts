import { PrismaService } from '../prisma/prisma.service';
export declare class ReportsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    printHistory(shopId?: string, page?: number, pageSize?: number): Promise<{
        items: ({
            shop: {
                id: string;
                createdAt: Date;
                name: string;
                status: import(".prisma/client").$Enums.ShopStatus;
                email: string;
                mobile: string;
                updatedAt: Date;
                ownerName: string;
                address: string;
                city: string;
                shopCode: string;
            };
            document: {
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
            };
            printer: {
                id: string;
                createdAt: Date;
                shopId: string;
                status: import(".prisma/client").$Enums.PrinterStatus;
                updatedAt: Date;
                agentId: string;
                agentKeyHash: string;
                printerName: string;
                driverName: string | null;
                lastHeartbeatAt: Date | null;
                capabilitiesJson: import("@prisma/client/runtime/library").JsonValue | null;
            } | null;
        } & {
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
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    failedJobs(page?: number, pageSize?: number): Promise<{
        items: ({
            shop: {
                id: string;
                createdAt: Date;
                name: string;
                status: import(".prisma/client").$Enums.ShopStatus;
                email: string;
                mobile: string;
                updatedAt: Date;
                ownerName: string;
                address: string;
                city: string;
                shopCode: string;
            };
            document: {
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
            };
        } & {
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
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    summary(): Promise<{
        totalShops: number;
        activeShops: number;
        totalJobs: number;
        printedJobs: number;
        failedJobs: number;
        pendingJobs: number;
        totalDocuments: number;
        totalRevenue: string;
    }>;
}
