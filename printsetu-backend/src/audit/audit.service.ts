import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

/**
 * Append-only audit trail (SRS §16 audit_logs, §18 "Audit logs for
 * administrative and sensitive operational actions"). No update method is
 * exposed. `clearAll` is a deliberate, explicit exception to "append-only"
 * requested by the product owner — it always re-logs the clear action
 * itself immediately after, so the trail never goes fully empty and who
 * cleared it stays recorded.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        shopId: entry.shopId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        metadataJson: (entry.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
  }

  async clearAll(actorUserId: string | null): Promise<{ cleared: number }> {
    const { count } = await this.prisma.auditLog.deleteMany({});
    await this.log({
      actorUserId,
      action: 'AUDIT_LOG_CLEARED',
      entityType: 'AuditLog',
      metadata: { clearedCount: count },
    });
    return { cleared: count };
  }
}
