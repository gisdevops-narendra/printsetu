import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { IStorageService } from '../storage/storage.interface';
import { QrService } from '../qr/qr.service';
import { FileValidationService } from './file-validation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppConfig } from '../config/configuration';
import { StatusTokenClaims } from '../common/types/request-context';
import { DocumentAnalysisJobData } from './document-analysis.processor';
export declare class DocumentsService {
    private readonly prisma;
    private readonly storage;
    private readonly qrService;
    private readonly fileValidation;
    private readonly notifications;
    private readonly config;
    private readonly analysisQueue;
    constructor(prisma: PrismaService, storage: IStorageService, qrService: QrService, fileValidation: FileValidationService, notifications: NotificationsService, config: ConfigService<AppConfig, true>, analysisQueue: Queue<DocumentAnalysisJobData>);
    upload(shopCode: string, file: Express.Multer.File): Promise<{
        documentId: string;
        docAccessToken: string;
        originalName: string;
        sizeBytes: number;
        mimeType: string;
        pageCount: number | null;
        colorPages: number | null;
        colorDetectionConfidence: string | null;
        status: import(".prisma/client").$Enums.DocumentStatus;
    }>;
    getForCustomer(documentId: string, claims: StatusTokenClaims): Promise<{
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
    }>;
    getPreviewUrlForShop(documentId: string, shopId: string): Promise<{
        url: string;
        expiresInSeconds: number;
    }>;
}
