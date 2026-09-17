import { decodeJwt, DecodedAccessToken } from './jwt.util';

// UTF-8-safe base64url encode — decodeJwt() reverses this exact scheme
// (percent-encoding each decoded byte, then decodeURIComponent), so a
// naive btoa(JSON.stringify(...)) would mis-encode any non-ASCII text.
function base64url(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeJwt(payload: object): string {
  return `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url(payload)}.fake-signature`;
}

describe('decodeJwt', () => {
  it('decodes a well-formed token payload', () => {
    const claims: DecodedAccessToken = {
      sub: 'user-1',
      email: 'admin.demo@printsetu.local',
      preferred_username: 'admin.demo',
      name: 'PrintSetu Admin',
      realm_access: { roles: ['ADMIN'] },
      exp: 9999999999,
    };
    const token = makeJwt(claims);
    expect(decodeJwt(token)).toEqual(claims);
  });

  it('decodes non-ASCII characters correctly (UTF-8 safe)', () => {
    const claims = {
      sub: 'x',
      email: 'a@b.com',
      preferred_username: 'x',
      name: 'Ünïcödé Ñame',
      exp: 1,
    };
    const token = makeJwt(claims);
    expect(decodeJwt<typeof claims>(token)?.name).toBe('Ünïcödé Ñame');
  });

  it('returns null for a malformed token', () => {
    expect(decodeJwt('not-a-jwt')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(decodeJwt('')).toBeNull();
  });

  it('returns null when the payload segment is not valid JSON', () => {
    const bogus = `${btoa('{}')}.${btoa('not-json')}.sig`;
    expect(decodeJwt(bogus)).toBeNull();
  });
});
