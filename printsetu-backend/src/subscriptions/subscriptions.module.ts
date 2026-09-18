import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import { ShopSubscriptionController } from './shop-subscription.controller';
import { PlansService } from './plans.service';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionAccessService } from './subscription-access.service';
import { InvoicesService } from './invoices.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { RevenueService } from './revenue.service';
import { BillingSettingsService } from './billing-settings.service';
import { BillingNotifierService } from './billing-notifier.service';
import { BillingAutomationService } from './billing-automation.service';
import { PaymentGatewayRegistry } from './payment-gateway';
import { ShopSubscriptionInterceptor } from './shop-subscription.interceptor';

/**
 * Plans, shop subscriptions, invoices/refunds, the renewal & dunning
 * automation, and the access rules other modules ask about
 * (SubscriptionAccessService is exported for the QR, print and printer flows).
 */
@Global()
@Module({
  imports: [SystemSettingsModule],
  controllers: [AdminSubscriptionsController, ShopSubscriptionController],
  providers: [
    PlansService,
    SubscriptionsService,
    SubscriptionAccessService,
    InvoicesService,
    InvoicePdfService,
    RevenueService,
    BillingSettingsService,
    BillingNotifierService,
    BillingAutomationService,
    PaymentGatewayRegistry,
    { provide: APP_INTERCEPTOR, useClass: ShopSubscriptionInterceptor },
  ],
  exports: [SubscriptionAccessService, SubscriptionsService, PaymentGatewayRegistry],
})
export class SubscriptionsModule {}
