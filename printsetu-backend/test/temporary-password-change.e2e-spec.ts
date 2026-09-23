import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp } from './support/app';
import { getAccessToken } from './support/keycloak';
import { makeTestPasswordTemporary } from './support/keycloak-admin';
import { registerShop } from './support/register';
import { PrismaService } from '../src/prisma/prisma.service';
import { CredentialCipherService } from '../src/common/crypto/credential-cipher.service';

/**
 * New accounts register with their own password, but accounts an admin
 * created earlier may still hold a temporary one. Exercises the forced
 * first-login password-change flow that still serves them, end to end
 * (AuthService.login / AuthService.changeTemporaryPassword) and the
 * admin-visible "current password" that backs it (AdminUsersService.list),
 * against the real dev Keycloak instance — not a stubbed guard.
 */
describe('Legacy temporary password: admin visibility and forced change (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    // Keycloak login: username "admin" / "admin" (see keycloak/printsetu-realm.json),
    // which resolves to the admin.demo@printsetu.local local user row (prisma/seed.ts).
    adminToken = await getAccessToken('admin', 'admin');
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('walks a legacy temp-password user through: visible to admin -> forced change at login -> gone from the admin list', async () => {
    // 1. A registered shopkeeper is put back into the legacy "admin-issued
    // temporary password" state (Keycloak required action + our DB flags).
    const { email } = await registerShop(server, 'temp-pw');
    const temporaryPassword = 'TempPass-e2e-123';
    const prisma = app.get(PrismaService);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await makeTestPasswordTemporary(user.keycloakUserId!, temporaryPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        mustChangePassword: true,
        currentPasswordEnc: app.get(CredentialCipherService).encrypt(temporaryPassword),
      },
    });

    // 2. Admin's user list shows the password back, decrypted, plus the pending-change flag.
    const listResBefore = await request(server)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const rowBefore = listResBefore.body.find((u: any) => u.email === email);
    expect(rowBefore.currentPassword).toBe(temporaryPassword);
    expect(rowBefore.mustChangePassword).toBe(true);
    expect(rowBefore.currentPasswordEnc).toBeUndefined();

    // 3. A normal login attempt with the temp password does NOT get tokens —
    // it gets the "please change your password" signal instead.
    const loginRes = await request(server)
      .post('/api/auth/login')
      .send({ username: email, password: temporaryPassword })
      .expect(201);
    expect(loginRes.body).toEqual({ requiresPasswordChange: true });

    // 4. The wrong current password is rejected outright.
    await request(server)
      .post('/api/auth/change-temporary-password')
      .send({ username: email, currentPassword: 'definitely-wrong', newPassword: 'NewStrongPass123' })
      .expect(401);

    // 5. A too-weak new password is rejected.
    await request(server)
      .post('/api/auth/change-temporary-password')
      .send({ username: email, currentPassword: temporaryPassword, newPassword: 'short' })
      .expect(400);

    // 6. The real change: correct temp password + a valid new one signs the user straight in.
    const newPassword = 'NewStrongPass123';
    const changeRes = await request(server)
      .post('/api/auth/change-temporary-password')
      .send({ username: email, currentPassword: temporaryPassword, newPassword })
      .expect(201);
    expect(changeRes.body.accessToken).toEqual(expect.any(String));
    expect(changeRes.body.refreshToken).toEqual(expect.any(String));

    // 7. The new password now logs in normally (no more required action).
    const secondLoginRes = await request(server)
      .post('/api/auth/login')
      .send({ username: email, password: newPassword })
      .expect(201);
    expect(secondLoginRes.body.accessToken).toEqual(expect.any(String));

    // 8. The old temp password no longer works.
    await request(server)
      .post('/api/auth/login')
      .send({ username: email, password: temporaryPassword })
      .expect(401);

    // 9. The admin list no longer shows a password for this user.
    const listResAfter = await request(server)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const rowAfter = listResAfter.body.find((u: any) => u.email === email);
    expect(rowAfter.currentPassword).toBeNull();
    expect(rowAfter.mustChangePassword).toBe(false);
  }, 30_000);
});
