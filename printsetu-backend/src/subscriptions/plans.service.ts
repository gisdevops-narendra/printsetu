import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppNotFoundException } from '../common/exceptions/app.exceptions';
import { BillingConflictException } from './subscription.exceptions';
import { UpsertPlanDto } from './dto/subscription.dto';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every plan with how many shops are on it (retired plans included, flagged by isActive). */
  async list() {
    const [plans, counts] = await Promise.all([
      this.prisma.subscriptionPlan.findMany({ orderBy: [{ sortOrder: 'asc' }, { monthlyPrice: 'asc' }] }),
      this.prisma.shopSubscription.groupBy({ by: ['planId'], _count: { _all: true } }),
    ]);
    const byPlan = new Map(counts.map((c) => [c.planId, c._count._all]));
    return plans.map((p) => ({ ...p, shopCount: byPlan.get(p.id) ?? 0 }));
  }

  private toData(dto: UpsertPlanDto) {
    const name = dto.name.trim();
    if (dto.yearlyPrice > dto.monthlyPrice * 12 + 0.001) {
      throw new BillingConflictException('The yearly price cannot be more than 12 months of the monthly price.');
    }
    return {
      name,
      description: dto.description?.trim() || null,
      monthlyPrice: dto.monthlyPrice,
      yearlyPrice: dto.yearlyPrice,
      trialDays: dto.trialDays ?? 0,
      maxPrintsPerMonth: dto.maxPrintsPerMonth ?? null,
      maxTokensPerDay: dto.maxTokensPerDay ?? null,
      maxPrinters: dto.maxPrinters ?? null,
      prioritySupport: dto.prioritySupport ?? false,
      analyticsAccess: dto.analyticsAccess ?? false,
      highlights: (dto.highlights ?? []).map((h) => h.trim()).filter(Boolean),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
    };
  }

  async create(dto: UpsertPlanDto) {
    try {
      return await this.prisma.subscriptionPlan.create({ data: this.toData(dto) });
    } catch (err) {
      throw this.mapUnique(err);
    }
  }

  async update(id: string, dto: UpsertPlanDto) {
    await this.findOrThrow(id);
    try {
      return await this.prisma.subscriptionPlan.update({ where: { id }, data: this.toData(dto) });
    } catch (err) {
      throw this.mapUnique(err);
    }
  }

  async setActive(id: string, isActive: boolean) {
    await this.findOrThrow(id);
    return this.prisma.subscriptionPlan.update({ where: { id }, data: { isActive } });
  }

  /** A plan that any shop or invoice still points at can only be retired, never deleted. */
  async remove(id: string) {
    await this.findOrThrow(id);
    const [subs, invoices] = await Promise.all([
      this.prisma.shopSubscription.count({ where: { OR: [{ planId: id }, { pendingPlanId: id }] } }),
      this.prisma.invoice.count({ where: { planId: id } }),
    ]);
    if (subs > 0 || invoices > 0) {
      throw new BillingConflictException(
        `This plan is used by ${subs} ${subs === 1 ? 'shop' : 'shops'} and ${invoices} ${invoices === 1 ? 'invoice' : 'invoices'}. Retire it instead so the history stays intact.`,
      );
    }
    await this.prisma.subscriptionPlan.delete({ where: { id } });
    return { deleted: true };
  }

  private async findOrThrow(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) throw new AppNotFoundException('Plan not found.');
    return plan;
  }

  private mapUnique(err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new BillingConflictException('A plan with this name already exists.');
    }
    return err;
  }
}
