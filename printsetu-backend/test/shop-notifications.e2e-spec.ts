import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp } from './support/app';
import { getAccessToken } from './support/keycloak';
import { registerShop } from './support/register';
import { buildMinimalPdf } from './support/fixtures';

/**
 * SRS §20 in-app notification baseline. Runs against the real dev stack;
 * provisions its own throwaway shop so counting/ordering assertions never
 * race against notifications the shared demo shop accumulates from other
 * suites or manual exploration.
 */
describe('Shop notifications (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let adminToken: string;
  let shopkeeperToken: string;
  let shopId: string;
  let shopCode: string;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    adminToken = await getAccessToken('admin', 'admin');

    ({ shopId, accessToken: shopkeeperToken } = await registerShop(server, 'notifications', {
      mobile: '9444444444',
      city: 'Bhavnagar',
    }));

    const qrRes = await request(server)
      .get(`/api/admin/qr/${shopId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    shopCode = qrRes.body.code;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('rejects an unauthenticated request', async () => {
    await request(server).get('/api/shop/notifications').expect(401);
  });

  it('rejects an admin token (shopkeeper-only)', async () => {
    await request(server)
      .get('/api/shop/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
  });

  it('starts empty for a freshly created shop', async () => {
    const res = await request(server)
      .get('/api/shop/notifications')
      .set('Authorization', `Bearer ${shopkeeperToken}`)
      .expect(200);
    expect(res.body).toEqual({ items: [], total: 0, page: 1, pageSize: 50 });
  });

  it('a real customer upload actually produces a visible UPLOAD_RECEIVED notification', async () => {
    await request(server)
      .post('/api/documents')
      .field('shopCode', shopCode)
      .attach('file', buildMinimalPdf(), { filename: 'notif.pdf', contentType: 'application/pdf' })
      .expect(201);

    const res = await request(server)
      .get('/api/shop/notifications')
      .set('Authorization', `Bearer ${shopkeeperToken}`)
      .expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.items[0]).toMatchObject({
      shopId,
      eventType: 'UPLOAD_RECEIVED',
      channel: 'IN_APP',
      status: 'SENT',
    });
  });

  it("never leaks another shop's notifications (tenant isolation)", async () => {
    const demoShopkeeperToken = await getAccessToken(
      'shopkeeper.demo@printsetu.local',
      'Shop@12345',
    );
    const res = await request(server)
      .get('/api/shop/notifications')
      .set('Authorization', `Bearer ${demoShopkeeperToken}`)
      .expect(200);
    expect(res.body.items.every((n: any) => n.shopId !== shopId)).toBe(true);
  });
});
