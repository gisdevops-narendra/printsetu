import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Minimal stateless signed-token helper (HMAC-SHA256) used for the
 * customer "secure short-lived status token" the SRS calls for (§5.2,
 * §8) instead of a mandatory customer account. Not a JWT library
 * dependency on purpose — the payload is tiny and fully controlled.
 */
export interface SignedTokenPayload {
  [key: string]: unknown;
  exp: number; // epoch seconds
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function signToken(payload: SignedTokenPayload, secret: string): string {
  const body = base64url(JSON.stringify(payload));
  const signature = base64url(createHmac('sha256', secret).update(body).digest());
  return `${body}.${signature}`;
}

export function verifyToken<T extends SignedTokenPayload = SignedTokenPayload>(
  token: string,
  secret: string,
): T {
  const [body, signature] = token.split('.');
  if (!body || !signature) {
    throw new Error('Malformed token');
  }
  const expectedSignature = base64url(createHmac('sha256', secret).update(body).digest());
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Invalid token signature');
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }
  return payload;
}
