import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exceptions';

/** A customer tried to order from a shop that cannot take orders right now. */
export class ShopUnavailableException extends AppException {
  constructor(message = 'This shop is temporarily unavailable.') {
    super('SHOP_UNAVAILABLE', message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}

/** The shop's own subscription state does not allow this action. */
export class SubscriptionRestrictedException extends AppException {
  constructor(
    message = 'Your subscription does not allow this action.',
    code = 'SUBSCRIPTION_RESTRICTED',
  ) {
    super(code, message, HttpStatus.FORBIDDEN);
  }
}

export class PlanLimitReachedException extends AppException {
  constructor(message = 'Your plan limit has been reached.') {
    super('PLAN_LIMIT_REACHED', message, HttpStatus.FORBIDDEN);
  }
}

export class BillingConflictException extends AppException {
  constructor(message: string) {
    super('BILLING_CONFLICT', message, HttpStatus.CONFLICT);
  }
}
