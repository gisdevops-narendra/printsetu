import { PrintJobsService } from './print-jobs.service';
import { ConfirmPrintJobDto, ReconcileJobDto } from './dto/print.dto';
import { StatusTokenClaims, AuthenticatedUser } from '../common/types/request-context';
export declare class PrintJobsController {
    private readonly printJobsService;
    constructor(printJobsService: PrintJobsService);
    confirm(dto: ConfirmPrintJobDto, claims: StatusTokenClaims): Promise<{
        jobId: string;
        status: import(".prisma/client").$Enums.PrintJobStatus;
        statusToken: string;
        amount: string;
        currency: string;
    }>;
    status(id: string, claims: StatusTokenClaims): Promise<{
        document: {
            id: string;
            status: import(".prisma/client").$Enums.DocumentStatus;
            shopId: string;
            originalName: string;
            s3Key: string;
            mimeType: string;
            sizeBytes: number;
            pageCount: number | null;
            colorPages: number | null;
            colorDetectionConfidence: string | null;
            uploadedAt: Date;
            deletedAt: Date | null;
        };
        events: {
            id: string;
            status: import(".prisma/client").$Enums.PrintJobStatus;
            createdAt: Date;
            printJobId: string;
            agentAttemptId: string | null;
            message: string | null;
        }[];
    } & {
        id: string;
        status: import(".prisma/client").$Enums.PrintJobStatus;
        createdAt: Date;
        shopId: string;
        documentId: string;
        printerId: string | null;
        quoteId: string | null;
        optionsJson: import("@prisma/client/runtime/library").JsonValue;
        amount: import("@prisma/client/runtime/library").Decimal;
        currency: string;
        attemptCount: number;
        idempotencyKey: string;
        queuedAt: Date | null;
        printedAt: Date | null;
        failureReason: string | null;
        statusToken: string;
        updatedAt: Date;
    }>;
}
export declare class ShopPrintJobsController {
    private readonly printJobsService;
    constructor(printJobsService: PrintJobsService);
    private requireShop;
    queue(user: AuthenticatedUser): Promise<({
        document: {
            id: string;
            status: import(".prisma/client").$Enums.DocumentStatus;
            shopId: string;
            originalName: string;
            s3Key: string;
            mimeType: string;
            sizeBytes: number;
            pageCount: number | null;
            colorPages: number | null;
            colorDetectionConfidence: string | null;
            uploadedAt: Date;
            deletedAt: Date | null;
        };
        printer: {
            id: string;
            status: import(".prisma/client").$Enums.PrinterStatus;
            createdAt: Date;
            shopId: string;
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
        status: import(".prisma/client").$Enums.PrintJobStatus;
        createdAt: Date;
        shopId: string;
        documentId: string;
        printerId: string | null;
        quoteId: string | null;
        optionsJson: import("@prisma/client/runtime/library").JsonValue;
        amount: import("@prisma/client/runtime/library").Decimal;
        currency: string;
        attemptCount: number;
        idempotencyKey: string;
        queuedAt: Date | null;
        printedAt: Date | null;
        failureReason: string | null;
        statusToken: string;
        updatedAt: Date;
    })[]>;
    history(user: AuthenticatedUser, page?: string, pageSize?: string): Promise<{
        items: ({
            document: {
                id: string;
                status: import(".prisma/client").$Enums.DocumentStatus;
                shopId: string;
                originalName: string;
                s3Key: string;
                mimeType: string;
                sizeBytes: number;
                pageCount: number | null;
                colorPages: number | null;
                colorDetectionConfidence: string | null;
                uploadedAt: Date;
                deletedAt: Date | null;
            };
            printer: {
                id: string;
                status: import(".prisma/client").$Enums.PrinterStatus;
                createdAt: Date;
                shopId: string;
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
            status: import(".prisma/client").$Enums.PrintJobStatus;
            createdAt: Date;
            shopId: string;
            documentId: string;
            printerId: string | null;
            quoteId: string | null;
            optionsJson: import("@prisma/client/runtime/library").JsonValue;
            amount: import("@prisma/client/runtime/library").Decimal;
            currency: string;
            attemptCount: number;
            idempotencyKey: string;
            queuedAt: Date | null;
            printedAt: Date | null;
            failureReason: string | null;
            statusToken: string;
            updatedAt: Date;
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    print(id: string, user: AuthenticatedUser): Promise<{
        jobId: string;
        status: import(".prisma/client").$Enums.PrintJobStatus;
        printerId: string;
        message: string;
    }>;
    reconcile(id: string, dto: ReconcileJobDto, user: AuthenticatedUser): Promise<{
        jobId: string;
        status: import(".prisma/client").$Enums.PrintJobStatus;
    }>;
}
