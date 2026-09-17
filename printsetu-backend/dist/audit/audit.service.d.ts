import { PrismaService } from '../prisma/prisma.service';
export interface AuditEntry {
    actorUserId?: string | null;
    shopId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    metadata?: unknown;
}
export declare class AuditService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    log(entry: AuditEntry): Promise<void>;
}
