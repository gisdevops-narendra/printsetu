import { Injectable } from '@nestjs/common';
import { PrintJobStatus, ShopStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async printHistory(shopId?: string, page = 1, pageSize = 50) {
    const take = Math.min(pageSize, 200);
    const skip = (Math.max(page, 1) - 1) * take;
    const where = shopId ? { shopId } : {};
    const [items, total] = await Promise.all([
      this.prisma.printJob.findMany({
        where,
        include: { document: true, shop: true, printer: true },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.printJob.count({ where }),
    ]);
    return { items, total, page, pageSize: take };
  }

  async failedJobs(page = 1, pageSize = 50) {
    const take = Math.min(pageSize, 200);
    const skip = (Math.max(page, 1) - 1) * take;
    const where = { status: { in: [PrintJobStatus.PRINT_FAILED, PrintJobStatus.PRINT_UNKNOWN, PrintJobStatus.AGENT_OFFLINE] } };
    const [items, total] = await Promise.all([
      this.prisma.printJob.findMany({
        where,
        include: { document: true, shop: true },
        orderBy: { updatedAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.printJob.count({ where }),
    ]);
    return { items, total, page, pageSize: take };
  }

  async summary() {
    const [totalShops, activeShops, totalJobs, printedJobs, failedJobs, pendingJobs, totalDocuments] =
      await Promise.all([
        this.prisma.shop.count(),
        this.prisma.shop.count({ where: { status: ShopStatus.ACTIVE } }),
        this.prisma.printJob.count(),
        this.prisma.printJob.count({ where: { status: { in: [PrintJobStatus.PRINTED, PrintJobStatus.RETENTION_PENDING, PrintJobStatus.DELETED] } } }),
        this.prisma.printJob.count({ where: { status: { in: [PrintJobStatus.PRINT_FAILED, PrintJobStatus.PRINT_UNKNOWN] } } }),
        this.prisma.printJob.count({ where: { status: { in: [PrintJobStatus.PRINT_ELIGIBLE, PrintJobStatus.QUEUED, PrintJobStatus.PRINTING, PrintJobStatus.AGENT_OFFLINE] } } }),
        this.prisma.document.count(),
      ]);

    const revenueAgg = await this.prisma.printJob.aggregate({
      _sum: { amount: true },
      where: { status: { in: [PrintJobStatus.PRINTED, PrintJobStatus.RETENTION_PENDING, PrintJobStatus.DELETED] } },
    });

    return {
      totalShops,
      activeShops,
      totalJobs,
      printedJobs,
      failedJobs,
      pendingJobs,
      totalDocuments,
      totalRevenue: (revenueAgg._sum.amount ?? 0).toString(),
    };
  }
}
