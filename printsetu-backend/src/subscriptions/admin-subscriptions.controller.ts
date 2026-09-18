import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { InvoiceStatus } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/request-context';
import { AuditService } from '../audit/audit.service';
import { PlansService } from './plans.service';
import { SubscriptionsService } from './subscriptions.service';
import { InvoicesService } from './invoices.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { RevenueService } from './revenue.service';
import { BillingSettingsService } from './billing-settings.service';
import { BillingAutomationService } from './billing-automation.service';
import {
  AssignPlanDto,
  CancelDto,
  ChangePlanDto,
  ExtendDto,
  ForceOverrideDto,
  MarkPaidDto,
  ReasonDto,
  RefundDto,
  SubscriptionPreferencesDto,
  UpdateBillingSettingsDto,
  UpsertPlanDto,
} from './dto/subscription.dto';

const actorOf = (u: AuthenticatedUser) => ({ id: u.id, name: u.name || u.email });

/**
 * Admin subscription management. Only the ADMIN role can reach any of this;
 * every mutation is recorded with the admin's id, time and reason (per-shop
 * history + the global audit log for manual actions).
 */
@Controller('admin/subscriptions')
@Roles('ADMIN')
export class AdminSubscriptionsController {
  constructor(
    private readonly plans: PlansService,
    private readonly subs: SubscriptionsService,
    private readonly invoices: InvoicesService,
    private readonly pdf: InvoicePdfService,
    private readonly revenue: RevenueService,
    private readonly settings: BillingSettingsService,
    private readonly automation: BillingAutomationService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------- dashboard

  @Get('dashboard')
  dashboard() {
    return this.revenue.dashboard();
  }

  // -------------------------------------------------------------- plans

  @Get('plans')
  listPlans() {
    return this.plans.list();
  }

  @Post('plans')
  async createPlan(@Body() dto: UpsertPlanDto, @CurrentUser() user: AuthenticatedUser) {
    const plan = await this.plans.create(dto);
    await this.audit.log({ actorUserId: user.id, action: 'PLAN_CREATED', entityType: 'plan', entityId: plan.id, metadata: { name: plan.name } });
    return plan;
  }

  @Patch('plans/:id')
  async updatePlan(@Param('id') id: string, @Body() dto: UpsertPlanDto, @CurrentUser() user: AuthenticatedUser) {
    const plan = await this.plans.update(id, dto);
    await this.audit.log({ actorUserId: user.id, action: 'PLAN_UPDATED', entityType: 'plan', entityId: id, metadata: { name: plan.name } });
    return plan;
  }

  @Patch('plans/:id/active')
  async setPlanActive(@Param('id') id: string, @Body() body: { isActive: boolean }, @CurrentUser() user: AuthenticatedUser) {
    const plan = await this.plans.setActive(id, !!body.isActive);
    await this.audit.log({
      actorUserId: user.id,
      action: plan.isActive ? 'PLAN_ACTIVATED' : 'PLAN_RETIRED',
      entityType: 'plan',
      entityId: id,
      metadata: { name: plan.name },
    });
    return plan;
  }

  @Delete('plans/:id')
  async deletePlan(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.plans.remove(id);
    await this.audit.log({ actorUserId: user.id, action: 'PLAN_DELETED', entityType: 'plan', entityId: id });
    return result;
  }

  // ----------------------------------------------------------- settings

  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @Patch('settings')
  async updateSettings(@Body() dto: UpdateBillingSettingsDto, @CurrentUser() user: AuthenticatedUser) {
    const next = await this.settings.update(dto);
    await this.audit.log({ actorUserId: user.id, action: 'BILLING_SETTINGS_UPDATED', entityType: 'billing_settings', metadata: { ...dto } });
    return next;
  }

  /** Runs the renewal / grace / retry / reminder checks now instead of waiting for the next scheduled run. */
  @Post('run-checks')
  async runChecks(@CurrentUser() user: AuthenticatedUser) {
    const summary = await this.automation.runAll();
    await this.audit.log({ actorUserId: user.id, action: 'BILLING_CHECKS_RUN', entityType: 'billing_settings', metadata: { changes: summary.changes.length } });
    return summary;
  }

  // ----------------------------------------------------------- invoices

  @Get('invoices')
  listInvoices(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('shopId') shopId?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
  ) {
    return this.invoices.list({
      status: status ? (status as InvoiceStatus) : undefined,
      search,
      shopId,
      page: parseInt(page, 10) || 1,
      pageSize: parseInt(pageSize, 10) || 25,
    });
  }

  @Get('invoices/:id/pdf')
  async invoicePdf(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const invoice = await this.invoices.findOrThrow(id);
    const buffer = await this.pdf.render(invoice);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.number}.pdf"`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(buffer);
  }

  @Post('invoices/:id/refund')
  async refund(@Param('id') id: string, @Body() dto: RefundDto, @CurrentUser() user: AuthenticatedUser) {
    const invoice = await this.invoices.findOrThrow(id);
    return this.subs.refund(invoice.shopId, id, dto, actorOf(user));
  }

  // -------------------------------------------------------------- shops

  @Get('shops')
  listShops(
    @Query('search') search?: string,
    @Query('planId') planId?: string,
    @Query('status') status?: string,
    @Query('expiringSoon') expiringSoon?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
  ) {
    return this.subs.listShops({
      search,
      planId,
      status,
      expiringSoon: expiringSoon === 'true',
      page: parseInt(page, 10) || 1,
      pageSize: parseInt(pageSize, 10) || 25,
    });
  }

  @Get('shops/:shopId')
  detail(@Param('shopId') shopId: string) {
    return this.subs.getDetail(shopId);
  }

  @Get('shops/:shopId/events')
  events(@Param('shopId') shopId: string, @Query('page') page = '1', @Query('pageSize') pageSize = '50') {
    return this.subs.listEvents(shopId, parseInt(page, 10) || 1, parseInt(pageSize, 10) || 50);
  }

  @Post('shops/:shopId/assign')
  assign(@Param('shopId') shopId: string, @Body() dto: AssignPlanDto, @CurrentUser() user: AuthenticatedUser) {
    return this.subs.assign(shopId, dto, actorOf(user));
  }

  @Post('shops/:shopId/change-plan')
  changePlan(@Param('shopId') shopId: string, @Body() dto: ChangePlanDto, @CurrentUser() user: AuthenticatedUser) {
    return this.subs.changePlan(shopId, dto, actorOf(user));
  }

  @Post('shops/:shopId/cancel-scheduled-change')
  cancelScheduled(@Param('shopId') shopId: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthenticatedUser) {
    return this.subs.cancelScheduledChange(shopId, actorOf(user), dto.reason);
  }

  @Post('shops/:shopId/extend')
  extend(@Param('shopId') shopId: string, @Body() dto: ExtendDto, @CurrentUser() user: AuthenticatedUser) {
    return this.subs.extend(shopId, dto, actorOf(user));
  }

  @Post('shops/:shopId/extend-grace')
  extendGrace(@Param('shopId') shopId: string, @Body() dto: ExtendDto, @CurrentUser() user: AuthenticatedUser) {
    return this.subs.extendGrace(shopId, dto, actorOf(user));
  }

  @Post('shops/:shopId/cancel')
  cancel(@Param('shopId') shopId: string, @Body() dto: CancelDto, @CurrentUser() user: AuthenticatedUser) {
    return this.subs.cancel(shopId, dto, actorOf(user));
  }

  @Post('shops/:shopId/resume')
  resume(@Param('shopId') shopId: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthenticatedUser) {
    return this.subs.resume(shopId, actorOf(user), dto.reason);
  }

  @Post('shops/:shopId/mark-paid')
  markPaid(@Param('shopId') shopId: string, @Body() dto: MarkPaidDto, @CurrentUser() user: AuthenticatedUser) {
    return this.subs.markPaid(shopId, dto, actorOf(user));
  }

  @Post('shops/:shopId/force-suspend')
  forceSuspend(@Param('shopId') shopId: string, @Body() dto: ForceOverrideDto, @CurrentUser() user: AuthenticatedUser) {
    return this.subs.forceSuspend(shopId, dto, actorOf(user));
  }

  @Post('shops/:shopId/force-reactivate')
  forceReactivate(@Param('shopId') shopId: string, @Body() dto: ForceOverrideDto, @CurrentUser() user: AuthenticatedUser) {
    return this.subs.forceReactivate(shopId, dto, actorOf(user));
  }

  @Post('shops/:shopId/release-override')
  release(@Param('shopId') shopId: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthenticatedUser) {
    return this.subs.releaseOverride(shopId, actorOf(user), dto.reason);
  }

  @Patch('shops/:shopId/preferences')
  preferences(@Param('shopId') shopId: string, @Body() dto: SubscriptionPreferencesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.subs.setPreferences(shopId, dto, actorOf(user));
  }
}
