import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PrintJobsRepository } from './print-jobs.repository';
import { IStorageService } from '../storage/storage.interface';
import { AgentConnectionRegistry } from '../agent-connection/agent-connection-registry.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/configuration';
import { StatusTokenClaims } from '../common/types/request-context';
import { ConfirmPrintJobDto, AgentJobStatusDto, ReconcileJobDto } from './dto/print.dto';
export declare class PrintJobsService {
    private readonly prisma;
    private readonly repo;
    private readonly storage;
    private readonly agentConnections;
    private readonly notifications;
    private readonly audit;
    private readonly config;
    private readonly dispatchQueue;
    constructor(prisma: PrismaService, repo: PrintJobsRepository, storage: IStorageService, agentConnections: AgentConnectionRegistry, notifications: NotificationsService, audit: AuditService, config: ConfigService<AppConfig, true>, dispatchQueue: Queue);
    confirmFromQuote(dto: ConfirmPrintJobDto, claims: StatusTokenClaims): Promise<{
        jobId: string;
        status: import(".prisma/client").$Enums.PrintJobStatus;
        statusToken: string;
        amount: string;
        currency: string;
    }>;
    shopQueue(shopId: string): Promise<({
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
    shopHistory(shopId: string, page?: number, pageSize?: number): Promise<{
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
    triggerPrint(jobId: string, shopId: string): Promise<{
        jobId: string;
        status: import(".prisma/client").$Enums.PrintJobStatus;
        printerId: string;
        message: string;
    }>;
    private resolveShopPrinter;
    dispatchToAgent(jobId: string): Promise<void>;
    reportAgentStatus(jobId: string, printerId: string, dto: AgentJobStatusDto): Promise<{
        jobId: string;
        status: import(".prisma/client").$Enums.PrintJobStatus;
    }>;
    reconcile(jobId: string, shopId: string, dto: ReconcileJobDto): Promise<{
        jobId: string;
        status: import(".prisma/client").$Enums.PrintJobStatus;
    }>;
    getStatusForCustomer(jobId: string, claims: StatusTokenClaims): Promise<{
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
