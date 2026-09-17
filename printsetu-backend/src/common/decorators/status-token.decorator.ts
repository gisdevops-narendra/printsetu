import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { StatusTokenClaims } from '../types/request-context';

/** Populated by StatusTokenGuard for customer-facing, no-login endpoints. */
export const StatusToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): StatusTokenClaims => {
    const request = ctx.switchToHttp().getRequest();
    return request.statusToken;
  },
);
