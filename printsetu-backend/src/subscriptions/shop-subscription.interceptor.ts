import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from, switchMap } from 'rxjs';
import { SubscriptionAccessService } from './subscription-access.service';
import { SubscriptionRestrictedException } from './subscription.exceptions';

/**
 * Applies the subscription's access rules to the shop portal API.
 *
 *   SUSPENDED  everything under /shop is locked except the billing section
 *   READ_ONLY  (past due / expired / cancelled) old orders can be viewed, but
 *              nothing that changes print jobs is allowed, so no new print
 *              requests can be accepted. Clearing history is still allowed.
 *
 * It is an interceptor rather than a guard so it always runs after
 * authentication has attached the user to the request.
 */
@Injectable()
export class ShopSubscriptionInterceptor implements NestInterceptor {
  constructor(private readonly access: SubscriptionAccessService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    const user = req.user as { role?: string; shopId?: string | null } | undefined;
    if (!user || user.role !== 'SHOPKEEPER' || !user.shopId) return next.handle();

    const path = String(req.originalUrl ?? req.url).split('?')[0].replace(/^\/api/, '');
    if (!path.startsWith('/shop/') || path.startsWith('/shop/subscription')) return next.handle();

    const method = String(req.method).toUpperCase();
    const shopId = user.shopId;
    return from(this.access.getAccess(shopId)).pipe(
      switchMap((access) => {
        if (access.level === 'SUSPENDED') {
          throw new SubscriptionRestrictedException(
            'Your shop is suspended. Open Billing to see what is outstanding.',
            'SUBSCRIPTION_SUSPENDED',
          );
        }
        const changesJobs = path.startsWith('/shop/print-jobs') && method !== 'GET';
        const clearingHistory = method === 'DELETE' && path === '/shop/print-jobs/history';
        if (access.level === 'READ_ONLY' && changesJobs && !clearingHistory) {
          throw new SubscriptionRestrictedException(
            'New print requests are paused because your subscription needs attention. You can still view past orders.',
            'SUBSCRIPTION_RESTRICTED',
          );
        }
        return next.handle();
      }),
    );
  }
}
