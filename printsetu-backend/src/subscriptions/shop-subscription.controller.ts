import { Body, Controller, Get, Param, Patch, Post, Res, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/request-context';
import { ShopAccessDeniedException } from '../common/exceptions/app.exceptions';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionAccessService } from './subscription-access.service';
import { InvoicesService } from './invoices.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { BillingSettingsService } from './billing-settings.service';
import { BillingNotifierService } from './billing-notifier.service';
import { ShopCancelDto, SubscriptionPreferencesDto } from './dto/subscription.dto';

/**
 * A shop owner's own billing page. This stays reachable even when the shop is
 * suspended (it is the one part of the portal that is never locked), so they
 * can see what is owed and download invoices.
 */
@Controller('shop/subscription')
@Roles('SHOPKEEPER')
export class ShopSubscriptionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subs: SubscriptionsService,
    private readonly access: SubscriptionAccessService,
    private readonly invoices: InvoicesService,
    private readonly pdf: InvoicePdfService,
    private readonly settings: BillingSettingsService,
    private readonly notifier: BillingNotifierService,
  ) {}

  private shopIdOf(user: AuthenticatedUser): string {
    if (!user.shopId) throw new ShopAccessDeniedException('Your account is not linked to a shop.');
    return user.shopId;
  }

  @Get()
  async overview(@CurrentUser() user: AuthenticatedUser) {
    const shopId = this.shopIdOf(user);
    const sub = await this.prisma.shopSubscription.findUnique({ where: { shopId }, include: { plan: true } });
    const pendingPlan = sub?.pendingPlanId
      ? await this.prisma.subscriptionPlan.findUnique({ where: { id: sub.pendingPlanId } })
      : null;
    const [usage, unpaid, settings, channels] = await Promise.all([
      this.access.usage(shopId),
      this.invoices.oldestUnpaid(shopId),
      this.settings.get(),
      this.notifier.channelsFor(sub?.notificationChannels),
    ]);
    return {
      access: this.access.describe(sub),
      subscription: sub
        ? {
            status: sub.status,
            cycle: sub.cycle,
            startDate: sub.startDate,
            currentPeriodStart: sub.currentPeriodStart,
            currentPeriodEnd: sub.currentPeriodEnd,
            trialEndsAt: sub.trialEndsAt,
            graceEndsAt: sub.graceEndsAt,
            autoRenew: sub.autoRenew,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            gateway: sub.gateway,
          }
        : null,
      plan: sub?.plan ?? null,
      pendingPlan: pendingPlan ? { id: pendingPlan.id, name: pendingPlan.name } : null,
      usage,
      amountDue: unpaid ? { invoiceId: unpaid.id, number: unpaid.number, amount: unpaid.amount, currency: unpaid.currency, dueDate: unpaid.dueDate } : null,
      channels,
      graceDays: settings.graceDays,
    };
  }

  @Get('invoices')
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.invoices.list({ shopId: this.shopIdOf(user), pageSize: 100 });
  }

  @Get('invoices/:id/pdf')
  async invoicePdf(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    const invoice = await this.invoices.findOrThrow(id, this.shopIdOf(user));
    const buffer = await this.pdf.render(invoice);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.number}.pdf"`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(buffer);
  }

  @Patch('preferences')
  async preferences(@Body() dto: SubscriptionPreferencesDto, @CurrentUser() user: AuthenticatedUser) {
    await this.subs.setPreferences(this.shopIdOf(user), dto, { id: user.id, name: user.name || user.email });
    return this.overview(user);
  }

  /** The shop ends its own subscription at the end of the period it has paid for. */
  @Post('cancel')
  async cancel(@Body() dto: ShopCancelDto, @CurrentUser() user: AuthenticatedUser) {
    await this.subs.cancel(
      this.shopIdOf(user),
      { mode: 'PERIOD_END', reason: dto.reason?.trim() || 'Cancelled by the shop owner.' },
      { id: user.id, name: user.name || user.email },
    );
    return this.overview(user);
  }

  @Post('resume')
  async resume(@CurrentUser() user: AuthenticatedUser) {
    await this.subs.resume(this.shopIdOf(user), { id: user.id, name: user.name || user.email }, 'Cancellation withdrawn by the shop owner.');
    return this.overview(user);
  }
}
