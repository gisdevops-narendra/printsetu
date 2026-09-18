import { Controller, Delete, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';

@Controller('admin/audit-logs')
@Roles('ADMIN')
export class AdminAuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async list(
    @Query('shopId') shopId?: string,
    @Query('entityType') entityType?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    const take = Math.min(parseInt(pageSize, 10) || 50, 200);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const where = {
      ...(shopId ? { shopId } : {}),
      ...(entityType ? { entityType } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page: Number(page), pageSize: take };
  }

  /**
   * Permanently deletes every audit log row. This is a deliberate exception
   * to the append-only design (see AuditService docblock) — it immediately
   * re-logs the clear action itself so who did it and when is never lost.
   */
  @Delete()
  clear(@CurrentUser() user: AuthenticatedUser) {
    return this.auditService.clearAll(user.id);
  }
}
