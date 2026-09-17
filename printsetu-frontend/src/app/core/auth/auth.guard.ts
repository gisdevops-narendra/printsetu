import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { RoleName } from '../models/models';

export function authGuard(...allowedRoles: RoleName[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const user = auth.user();
    if (!user) return router.createUrlTree(['/login']);
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      return router.createUrlTree(['/login']);
    }
    return true;
  };
}
