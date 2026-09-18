import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { SubscriptionStatusService } from '../services/subscription-status.service';

/**
 * A suspended shop is locked out of the whole portal except Billing, so every
 * other shop route redirects there.
 */
export const shopAccessGuard: CanActivateChildFn = (childRoute) => {
  const status = inject(SubscriptionStatusService);
  const router = inject(Router);
  if (childRoute.routeConfig?.path === 'billing') return true;
  return status.ensureLoaded().pipe(map(() => (status.suspended() ? router.createUrlTree(['/shop/billing']) : true)));
};
