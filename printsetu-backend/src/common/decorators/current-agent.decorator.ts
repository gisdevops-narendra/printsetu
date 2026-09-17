import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedAgent } from '../types/request-context';

export const CurrentAgent = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAgent => {
    const request = ctx.switchToHttp().getRequest();
    return request.agent;
  },
);
