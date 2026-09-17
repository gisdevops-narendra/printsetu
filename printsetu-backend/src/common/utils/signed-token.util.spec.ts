import { signToken, verifyToken } from './signed-token.util';

describe('signed-token.util', () => {
  const secret = 'test-secret';

  it('round-trips a payload', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = signToken({ shopId: 'shop-1', documentId: 'doc-1', exp }, secret);
    const claims = verifyToken<{ shopId: string; documentId: string; exp: number }>(token, secret);
    expect(claims.shopId).toBe('shop-1');
    expect(claims.documentId).toBe('doc-1');
  });

  it('rejects a token signed with a different secret', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = signToken({ shopId: 'shop-1', exp }, secret);
    expect(() => verifyToken(token, 'wrong-secret')).toThrow();
  });

  it('rejects a tampered payload', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = signToken({ shopId: 'shop-1', exp }, secret);
    const [body, signature] = token.split('.');
    const tamperedBody = Buffer.from(JSON.stringify({ shopId: 'shop-2', exp })).toString('base64url');
    expect(() => verifyToken(`${tamperedBody}.${signature}`, secret)).toThrow();
  });

  it('rejects an expired token', () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    const token = signToken({ shopId: 'shop-1', exp }, secret);
    expect(() => verifyToken(token, secret)).toThrow('Token expired');
  });

  it('rejects a malformed token', () => {
    expect(() => verifyToken('not-a-token', secret)).toThrow();
  });
});
