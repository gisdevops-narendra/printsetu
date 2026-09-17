import { PrismaService } from '../prisma/prisma.service';
export declare class AdminAuditController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    list(shopId?: string, entityType?: string, page?: string, pageSize?: string): Promise<{
        items: {
            id: string;
            action: string;
            entityType: string;
            entityId: string | null;
            ip: string | null;
            userAgent: string | null;
            metadataJson: import("@prisma/client/runtime/library").JsonValue | null;
            createdAt: Date;
            actorUserId: string | null;
            shopId: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
}
