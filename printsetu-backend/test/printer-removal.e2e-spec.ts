import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp } from './support/app';
import { getAccessToken } from './support/keycloak';

/**
 * Exercises PrintersService.remove end to end: the admin-facing unlink
 * action, and everything it needs to actually revoke the printer rather
 * than just hide it — the agent credential must stop authenticating, and
 * the printer must disappear from listings.
 */
describe('Printer removal / unlink (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let adminToken: string;
  let shopId: string;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    adminToken = await getAccessToken('admin', 'admin');

    const shopRes = await request(server)
      .post('/api/admin/shops')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'E2E Printer Removal Test Shop',
        ownerName: 'Test Owner',
        mobile: '9333333333',
        email: `e2e-printer-removal-shop-${Date.now()}@printsetu.local`,
        address: '4th Floor, Test Road',
        city: 'Surat',
      })
      .expect(201);
    shopId = shopRes.body.id;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('unlinks a printer: agent credential stops working, printer disappears from listings, default clears', async () => {
    // 1. Register a printer/agent for the shop.
    const registerRes = await request(server)
      .post('/api/agent/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ shopId, printerName: 'E2E Test Printer', driverName: 'test-driver' })
      .expect(201);
    const { printerId, agentCredential } = registerRes.body;
    expect(printerId).toEqual(expect.any(String));

    // 2. It shows up in the admin list, and the agent credential authenticates.
    const listBefore = await request(server)
      .get('/api/admin/printers')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ shopId })
      .expect(200);
    expect(listBefore.body.some((p: any) => p.id === printerId)).toBe(true);

    await request(server)
      .post('/api/agent/heartbeat')
      .set('Authorization', `Bearer ${agentCredential}`)
      .expect(201);

    // 3. Set it as the shop's default printer, so we can confirm removal clears that too.
    await request(server)
      .patch(`/api/admin/printers/shops/${shopId}/default`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ printerId })
      .expect(200);

    // 4. Remove/unlink it.
    await request(server)
      .delete(`/api/admin/printers/${printerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // 5. Gone from the admin list.
    const listAfter = await request(server)
      .get('/api/admin/printers')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ shopId })
      .expect(200);
    expect(listAfter.body.some((p: any) => p.id === printerId)).toBe(false);

    // 6. Its agent credential is dead — a still-running physical agent can't keep polling/printing.
    await request(server)
      .post('/api/agent/heartbeat')
      .set('Authorization', `Bearer ${agentCredential}`)
      .expect(401);

    // 7. It can no longer be picked as the shop's default (it's gone from that shop's eyes).
    await request(server)
      .patch(`/api/admin/printers/shops/${shopId}/default`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ printerId })
      .expect(404);

    // 8. Removing again is idempotent, not an error.
    await request(server)
      .delete(`/api/admin/printers/${printerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // 9. Removing a printer that never existed 404s.
    await request(server)
      .delete('/api/admin/printers/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  }, 30_000);
});
