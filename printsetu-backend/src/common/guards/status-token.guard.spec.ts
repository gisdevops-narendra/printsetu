import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StatusTokenGuard } from './status-token.guard';
import { signToken } from '../utils/signed-token.util';
import { UnauthenticatedException } from '../exceptions/app.exceptions';

function makeContext(headers: Record<string, string>) {
  const request: any = { headers, query: {} };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('StatusTokenGuard (SRS §5.2 no-login customer flow)', () => {
  const secret = 'test-secret';
  const config = { get: () => ({ statusTokenSecret: secret }) } as unknown as ConfigService;
  const guard = new StatusTokenGuard(config);

  it('accepts a valid, unexpired token and attaches its claims to the request', () => {
    const token = signToken({ shopId: 'shop-1', documentId: 'doc-1', exp: Math.floor(Date.now() / 1000) + 60 }, secret);
    const ctx = makeContext({ 'x-status-token': token });
    expect(guard.canActivate(ctx)).toBe(true);
    expect((ctx.switchToHttp().getRequest() as any).statusToken.documentId).toBe('doc-1');
  });

  it('rejects a request with no token at all', () => {
    expect(() => guard.canActivate(makeContext({}))).toThrow(UnauthenticatedException);
  });

  it('rejects an expired token', () => {
    const token = signToken({ shopId: 'shop-1', exp: Math.floor(Date.now() / 1000) - 5 }, secret);
    expect(() => guard.canActivate(makeContext({ 'x-status-token': token }))).toThrow(UnauthenticatedException);
  });

  it('rejects a token signed with a different secret (forged token)', () => {
    const token = signToken({ shopId: 'shop-1', exp: Math.floor(Date.now() / 1000) + 60 }, 'a-different-secret');
    expect(() => guard.canActivate(makeContext({ 'x-status-token': token }))).toThrow(UnauthenticatedException);
  });
});
