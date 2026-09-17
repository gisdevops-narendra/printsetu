import { Request } from 'express';
import { DocumentsService } from './documents.service';
import { StatusTokenClaims } from '../common/types/request-context';
export declare class DocumentsController {
    private readonly documentsService;
    constructor(documentsService: DocumentsService);
    upload(file: Express.Multer.File, req: Request): Promise<{
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
    get(id: string, claims: StatusTokenClaims): Promise<{
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
}
