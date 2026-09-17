import { generateAgentSecret, hashSecret, verifySecret } from './secret.util';

describe('secret.util (agent credentials)', () => {
  it('generates unique high-entropy secrets', () => {
    const a = generateAgentSecret();
    const b = generateAgentSecret();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThan(30);
  });

  it('verifies a correctly hashed secret', () => {
    const secret = generateAgentSecret();
    const hash = hashSecret(secret);
    expect(verifySecret(secret, hash)).toBe(true);
  });

  it('rejects an incorrect secret against a stored hash', () => {
    const hash = hashSecret(generateAgentSecret());
    expect(verifySecret(generateAgentSecret(), hash)).toBe(false);
  });

  it('rejects a malformed stored hash rather than throwing', () => {
    expect(verifySecret('anything', 'not-a-valid-hash')).toBe(false);
  });

  it('never stores the same hash twice for the same secret (random salt)', () => {
    const secret = generateAgentSecret();
    expect(hashSecret(secret)).not.toEqual(hashSecret(secret));
  });
});
