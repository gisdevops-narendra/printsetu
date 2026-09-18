import { Injectable } from '@nestjs/common';
import { Invoice } from '@prisma/client';

export interface ChargeResult {
  ok: boolean;
  /** Gateway payment / transaction id. */
  reference?: string;
  /** Why it failed, shown in the billing history. */
  error?: string;
}

/**
 * Adapter for an automatic payment provider (Razorpay, Stripe, ...).
 * A shop's subscription names its gateway; "MANUAL" (the default) means
 * payments are collected offline and recorded by an administrator, so there
 * is nothing to charge or retry.
 *
 * No provider is connected yet. To add one, implement this interface and
 * call PaymentGatewayRegistry.register() from that provider's module: the
 * renewal and retry logic in BillingAutomationService will then use it.
 */
export interface PaymentGateway {
  readonly name: string;
  charge(invoice: Invoice): Promise<ChargeResult>;
}

@Injectable()
export class PaymentGatewayRegistry {
  private readonly gateways = new Map<string, PaymentGateway>();

  register(gateway: PaymentGateway): void {
    this.gateways.set(gateway.name.toUpperCase(), gateway);
  }

  /** undefined for MANUAL and for any gateway that is not connected. */
  get(name: string): PaymentGateway | undefined {
    return this.gateways.get(name.toUpperCase());
  }
}
