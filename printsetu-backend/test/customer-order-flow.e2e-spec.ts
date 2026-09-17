import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp } from './support/app';
import { getAccessToken } from './support/keycloak';
import { makeTestPasswordPermanent } from './support/keycloak-admin';
import { buildMinimalPdf } from './support/fixtures';

/**
 * SRS §5 Business Workflow / §22 "API tests for ... uploads and print
 * endpoints" / "Integration tests for S3, database". Runs against the
 * real dev stack (Postgres, Redis+BullMQ, MinIO, the Python doc-analysis
 * service) — nothing here is mocked, including the async
 * document-analysis worker added for the Upload/Processing pipeline.
 *
 * This suite provisions its OWN throwaway shop/QR/pricing via the admin
 * and shop APIs rather than depending on the shared seeded demo shop
 * (SHOP-DEMO001) — that fixture is also the one a human operator explores
 * the running dev app with, and any real admin action against it (e.g.
 * regenerating its QR code from the Admin UI) would otherwise make this
 * suite flaky. A dedicated shop per run has no such shared-state risk.
 * Pricing (SRS §10) is owned by the shop itself, so this needs a
 * throwaway shopkeeper login, not the admin token.
 */
describe('Customer order flow (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let shopCode: string; // the shop's public QR code, not its shop_code field

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();

    const adminToken = await getAccessToken('admin.demo@printsetu.local', 'Admin@12345');

    const shopRes = await request(server)
      .post('/api/admin/shops')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'E2E Order-Flow Test Shop',
        ownerName: 'Test Owner',
        mobile: '9222222222',
        email: `e2e-orderflow-${Date.now()}@printsetu.local`,
        address: '3rd Floor, Test Road',
        city: 'Vadodara',
      })
      .expect(201);
    const shopId = shopRes.body.id;

    const shopkeeperEmail = `e2e-orderflow-shopkeeper-${Date.now()}@printsetu.local`;
    const userRes = await request(server)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E Shopkeeper', email: shopkeeperEmail, role: 'SHOPKEEPER', shopId })
      .expect(201);
    await makeTestPasswordPermanent(userRes.body.keycloakUserId, userRes.body.temporaryPassword);
    const shopkeeperToken = await getAccessToken(shopkeeperEmail, userRes.body.temporaryPassword);

    await request(server)
      .post('/api/shop/pricing')
      .set('Authorization', `Bearer ${shopkeeperToken}`)
      .send({ paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', pricePerPage: 2 })
      .expect(201);

    const qrRes = await request(server)
      .get(`/api/admin/qr/${shopId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    shopCode = qrRes.body.code;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  function uploadPdf(filename: string) {
    return request(server)
      .post('/api/documents')
      .field('shopCode', shopCode)
      .attach('file', buildMinimalPdf(), { filename, contentType: 'application/pdf' });
  }

  it("resolves this suite's shop by its public QR code", async () => {
    const res = await request(server).get(`/api/public/shops/${shopCode}`).expect(200);
    expect(res.body).toMatchObject({ shopCode, shopName: 'E2E Order-Flow Test Shop' });
  });

  it('rejects an unknown/invalid QR code', async () => {
    await request(server).get('/api/public/shops/this-code-does-not-exist').expect(404);
  });

  it('rejects an upload with no recognizable file signature (magic-byte validation)', async () => {
    await request(server)
      .post('/api/documents')
      .field('shopCode', shopCode)
      .attach('file', Buffer.from('this is plainly not a document'), {
        filename: 'fake.pdf',
        contentType: 'application/pdf',
      })
      .expect(422);
  });

  it('rejects an upload for an unknown shop code', async () => {
    await request(server)
      .post('/api/documents')
      .field('shopCode', 'no-such-shop')
      .attach('file', buildMinimalPdf(), { filename: 'test.pdf', contentType: 'application/pdf' })
      .expect(404);
  });

  it('drives the full journey: upload -> async analysis completes -> quote -> confirm -> status', async () => {
    const uploadRes = await uploadPdf('journey.pdf').expect(201);

    // Analysis is queued, not inline — the upload response must not block
    // on it (this is the behavior the Upload/Processing pipeline exists for).
    expect(uploadRes.body.status).toBe('UPLOADED');
    expect(uploadRes.body.pageCount).toBeNull();
    const { documentId, docAccessToken } = uploadRes.body;
    expect(typeof documentId).toBe('string');
    expect(typeof docAccessToken).toBe('string');

    // Poll the real status until the real BullMQ worker + real Python
    // analysis service finish (or fail) the job — no mocks in this path.
    let doc: any;
    for (let attempt = 0; attempt < 20; attempt++) {
      const res = await request(server)
        .get(`/api/documents/${documentId}`)
        .set('x-status-token', docAccessToken)
        .expect(200);
      doc = res.body;
      if (doc.status === 'PROCESSED' || doc.status === 'ANALYSIS_FAILED') break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    expect(doc.status).toBe('PROCESSED');
    expect(doc.pageCount).toBe(1);

    const quoteRes = await request(server)
      .post('/api/print/quote')
      .set('x-status-token', docAccessToken)
      .send({ documentId, paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 2 })
      .expect(201);
    expect(quoteRes.body.pageCount).toBe(1);
    expect(quoteRes.body.billablePages).toBe(2); // 1 page x 2 copies, SRS §17.1 example shape

    const confirmRes = await request(server)
      .post('/api/print-jobs')
      .set('x-status-token', docAccessToken)
      .send({ quoteId: quoteRes.body.quoteId })
      .expect(201);
    expect(confirmRes.body.status).toBe('PRINT_ELIGIBLE'); // SRS §11: no payment gateway step
    const { jobId, statusToken } = confirmRes.body;

    const statusRes = await request(server)
      .get(`/api/print-jobs/${jobId}`)
      .set('x-status-token', statusToken)
      .expect(200);
    expect(statusRes.body.status).toBe('PRINT_ELIGIBLE');
    expect(statusRes.body.document.id).toBe(documentId);
  }, 25_000);

  it('blocks a second quote for the same confirmed document (one active print lifecycle)', async () => {
    const uploadRes = await uploadPdf('reused.pdf').expect(201);
    const { documentId, docAccessToken } = uploadRes.body;

    let status = 'UPLOADED';
    for (let attempt = 0; attempt < 20 && status !== 'PROCESSED'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const res = await request(server)
        .get(`/api/documents/${documentId}`)
        .set('x-status-token', docAccessToken);
      status = res.body.status;
    }
    expect(status).toBe('PROCESSED');

    const quote1 = await request(server)
      .post('/api/print/quote')
      .set('x-status-token', docAccessToken)
      .send({ documentId, paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 1 })
      .expect(201);
    await request(server)
      .post('/api/print-jobs')
      .set('x-status-token', docAccessToken)
      .send({ quoteId: quote1.body.quoteId })
      .expect(201);

    await request(server)
      .post('/api/print/quote')
      .set('x-status-token', docAccessToken)
      .send({ documentId, paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 1 })
      .expect(400);
  }, 25_000);

  it('rejects a status token minted for a different document (tenant/resource isolation)', async () => {
    const [uploadA, uploadB] = await Promise.all([
      uploadPdf('a.pdf').expect(201),
      uploadPdf('b.pdf').expect(201),
    ]);

    await request(server)
      .get(`/api/documents/${uploadA.body.documentId}`)
      .set('x-status-token', uploadB.body.docAccessToken) // token minted for document B
      .expect(403);
  });

  it('rejects requests to customer endpoints with no status token at all', async () => {
    await request(server).post('/api/print/quote').send({}).expect(401);
  });
});
