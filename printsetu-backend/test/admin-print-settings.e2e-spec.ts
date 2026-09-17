import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp } from './support/app';
import { getAccessToken } from './support/keycloak';
import { buildMinimalPdf } from './support/fixtures';

/**
 * SRS §6 ("System settings, retention settings") / §9 (per-shop retention
 * window) / §5.2 (per-shop max upload size). Runs against the real dev
 * stack; provisions its own throwaway shop so it never depends on the
 * shared seeded demo shop's mutable state.
 */
describe('Admin print settings (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let adminToken: string;
  let shopkeeperToken: string;
  let shopId: string;
  let shopCode: string;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    [adminToken, shopkeeperToken] = await Promise.all([
      getAccessToken('admin.demo@printsetu.local', 'Admin@12345'),
      getAccessToken('shopkeeper.demo@printsetu.local', 'Shop@12345'),
    ]);

    const shopRes = await request(server)
      .post('/api/admin/shops')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'E2E Print-Settings Test Shop',
        ownerName: 'Test Owner',
        mobile: '9333333333',
        email: `e2e-settings-${Date.now()}@printsetu.local`,
        address: '4th Floor, Test Road',
        city: 'Rajkot',
      })
      .expect(201);
    shopId = shopRes.body.id;

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
    await request(server).get(`/api/admin/shops/${shopId}/settings`).expect(401);
  });

  it('rejects a shopkeeper token (admin-only)', async () => {
    await request(server)
      .get(`/api/admin/shops/${shopId}/settings`)
      .set('Authorization', `Bearer ${shopkeeperToken}`)
      .expect(403);
  });

  it('returns the default settings for a freshly created shop', async () => {
    const res = await request(server)
      .get(`/api/admin/shops/${shopId}/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body).toMatchObject({ shopId, retentionMinutes: 30, maxFileSizeBytes: 26_214_400 });
  });

  it('404s for a shop that does not exist', async () => {
    await request(server)
      .get('/api/admin/shops/00000000-0000-0000-0000-000000000000/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('rejects an out-of-range retentionMinutes', async () => {
    await request(server)
      .patch(`/api/admin/shops/${shopId}/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ retentionMinutes: 0 })
      .expect(400);
  });

  it('updates retentionMinutes only, leaving maxFileSizeBytes untouched', async () => {
    const res = await request(server)
      .patch(`/api/admin/shops/${shopId}/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ retentionMinutes: 45 })
      .expect(200);
    expect(res.body.retentionMinutes).toBe(45);
    expect(res.body.maxFileSizeBytes).toBe(26_214_400);

    const getRes = await request(server)
      .get(`/api/admin/shops/${shopId}/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(getRes.body.retentionMinutes).toBe(45);
  });

  it('a lowered maxFileSizeBytes is actually enforced on the next customer upload (not just stored)', async () => {
    // Padded past the DTO's 1024-byte floor so a valid (if small)
    // maxFileSizeBytes setting can still be smaller than the upload.
    const paddedPdf = Buffer.concat([buildMinimalPdf(), Buffer.alloc(2000)]);
    expect(paddedPdf.length).toBeGreaterThan(1024);

    await request(server)
      .patch(`/api/admin/shops/${shopId}/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ maxFileSizeBytes: 1024 })
      .expect(200);

    await request(server)
      .post('/api/documents')
      .field('shopCode', shopCode)
      .attach('file', paddedPdf, { filename: 'toolarge.pdf', contentType: 'application/pdf' })
      .expect(413);

    // restore a workable limit so this test doesn't poison any later run
    // against the same shop within this suite.
    await request(server)
      .patch(`/api/admin/shops/${shopId}/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ maxFileSizeBytes: 26_214_400 })
      .expect(200);
  }, 15_000);
});
