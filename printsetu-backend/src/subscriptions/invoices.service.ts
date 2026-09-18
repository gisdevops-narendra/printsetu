import { Injectable } from '@nestjs/common';
import {
  BillingCycle,
  Invoice,
  InvoiceKind,
  InvoiceStatus,
  PaymentMethod,
  Prisma,
  SubscriptionPlan,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppNotFoundException } from '../common/exceptions/app.exceptions';
import { BillingConflictException } from './subscription.exceptions';
import { round2 } from './subscription.constants';

type Db = PrismaService | Prisma.TransactionClient;

export interface CreateInvoiceInput {
  shopId: string;
  plan: Pick<SubscriptionPlan, 'id' | 'name' | 'currency'>;
  cycle: BillingCycle;
  kind: InvoiceKind;
  description: string;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  dueDate: Date;
}

export interface InvoiceListFilters {
  shopId?: string;
  status?: InvoiceStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export const priceFor = (plan: Pick<SubscriptionPlan, 'monthlyPrice' | 'yearlyPrice'>, cycle: BillingCycle): number =>
  Number(cycle === 'YEARLY' ? plan.yearlyPrice : plan.monthlyPrice);

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  private async nextNumber(db: Db): Promise<string> {
    const rows = await db.$queryRaw<{ n: bigint }[]>`SELECT nextval('invoice_number_seq') AS n`;
    const now = new Date();
    const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    return `INV-${ym}-${String(rows[0].n).padStart(6, '0')}`;
  }

  async create(input: CreateInvoiceInput, db: Db = this.prisma): Promise<Invoice> {
    return db.invoice.create({
      data: {
        number: await this.nextNumber(db),
        shopId: input.shopId,
        planId: input.plan.id,
        planName: input.plan.name,
        currency: input.plan.currency,
        cycle: input.cycle,
        kind: input.kind,
        description: input.description,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        amount: round2(input.amount),
        dueDate: input.dueDate,
      },
    });
  }

  async findOrThrow(id: string, shopId?: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { refunds: { orderBy: { createdAt: 'asc' } }, shop: true },
    });
    if (!invoice || (shopId && invoice.shopId !== shopId)) throw new AppNotFoundException('Invoice not found.');
    return invoice;
  }

  /** Oldest invoice still waiting for payment. */
  async oldestUnpaid(shopId: string, db: Db = this.prisma) {
    return db.invoice.findFirst({
      where: { shopId, status: { in: ['OPEN', 'FAILED'] } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markPaid(
    invoiceId: string,
    paid: { method: PaymentMethod; reference?: string | null; at?: Date },
    db: Db = this.prisma,
  ): Promise<Invoice> {
    const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new AppNotFoundException('Invoice not found.');
    if (invoice.status === 'PAID') throw new BillingConflictException('This invoice is already paid.');
    if (invoice.status !== 'OPEN' && invoice.status !== 'FAILED') {
      throw new BillingConflictException(`A ${invoice.status.toLowerCase()} invoice cannot be marked as paid.`);
    }
    return db.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'PAID',
        paidAt: paid.at ?? new Date(),
        paymentMethod: paid.method,
        paymentReference: paid.reference ?? null,
        nextRetryAt: null,
      },
    });
  }

  async voidInvoice(invoiceId: string, db: Db = this.prisma) {
    await db.invoice.updateMany({
      where: { id: invoiceId, status: { in: ['OPEN', 'FAILED'] } },
      data: { status: 'VOID', nextRetryAt: null },
    });
  }

  /** Records a full or partial refund against a paid invoice. */
  async refund(invoiceId: string, amount: number, reason: string, actorUserId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) throw new AppNotFoundException('Invoice not found.');
      if (invoice.status !== 'PAID' && invoice.status !== 'PARTIALLY_REFUNDED') {
        throw new BillingConflictException('Only a paid invoice can be refunded.');
      }
      const refundable = round2(Number(invoice.amount) - Number(invoice.refundedAmount));
      const value = round2(amount);
      if (value <= 0) throw new BillingConflictException('Enter a refund amount above zero.');
      if (value > refundable) {
        throw new BillingConflictException(`You can refund at most ${refundable.toFixed(2)} on this invoice.`);
      }
      const refund = await tx.refund.create({ data: { invoiceId, amount: value, reason, actorUserId } });
      const totalRefunded = round2(Number(invoice.refundedAmount) + value);
      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          refundedAmount: totalRefunded,
          status: totalRefunded >= Number(invoice.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      });
      return { refund, invoice: updated };
    });
  }

  async list(filters: InvoiceListFilters) {
    const take = Math.min(Math.max(filters.pageSize ?? 25, 1), 100);
    const skip = (Math.max(filters.page ?? 1, 1) - 1) * take;
    const search = filters.search?.trim();
    const where: Prisma.InvoiceWhereInput = {
      ...(filters.shopId ? { shopId: filters.shopId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: 'insensitive' } },
              { shop: { name: { contains: search, mode: 'insensitive' } } },
              { paymentReference: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: { shop: { select: { id: true, name: true, shopCode: true } } },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items, total, page: Math.max(filters.page ?? 1, 1), pageSize: take };
  }
}
