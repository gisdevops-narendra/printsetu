import request from 'supertest';

export interface RegisteredShop {
  shopId: string;
  email: string;
  password: string;
  accessToken: string;
}

/**
 * Creates a throwaway shop + its shopkeeper login through the real public
 * registration endpoint (POST /api/auth/register) — the only way shops and
 * shopkeepers are created — and returns the signed-in shopkeeper's token.
 */
export async function registerShop(
  server: any,
  label: string,
  overrides: Partial<{ shopName: string; city: string; mobile: string }> = {},
): Promise<RegisteredShop> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e-${label}-${unique}@printsetu.local`;
  const password = 'E2eStrongPass123';
  const res = await request(server)
    .post('/api/auth/register')
    .send({
      shopName: overrides.shopName ?? `E2E ${label} Test Shop`,
      ownerName: 'E2E Shopkeeper',
      mobile: overrides.mobile ?? '9222222222',
      email,
      address: '3rd Floor, Test Road',
      city: overrides.city ?? 'Surat',
      password,
    })
    .expect(201);
  return { shopId: res.body.shopId, email, password, accessToken: res.body.accessToken };
}
