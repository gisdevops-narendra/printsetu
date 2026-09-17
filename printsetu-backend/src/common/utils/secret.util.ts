import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/**
 * Agent credential hashing (SRS §13.1: "each agent receives a unique
 * device/agent identity and credential"). scrypt keeps this dependency-free
 * (no bcrypt native binding) while still being a deliberately-slow KDF.
 */
export function generateAgentSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(secret, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
