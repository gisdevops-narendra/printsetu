import { Request } from 'express';
import { QrService } from './qr.service';
import { AuthenticatedUser } from '../common/types/request-context';
import { AuditService } from '../audit/audit.service';
export declare class AdminQrController {
    private readonly qrService;
    private readonly audit;
    constructor(qrService: QrService, audit: AuditService);
    getOrCreate(shopId: string): Promise<{
        dataUrl: string;
        url: string;
        code: string;
    }>;
    regenerate(shopId: string, user: AuthenticatedUser, req: Request): Promise<{
        dataUrl: string;
        url: string;
        code: string;
    }>;
}
