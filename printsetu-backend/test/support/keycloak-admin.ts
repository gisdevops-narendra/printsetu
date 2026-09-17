import axios from 'axios';

const KEYCLOAK_BASE_URL = process.env.KEYCLOAK_BASE_URL || 'http://localhost:58080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'printsetu';
const ADMIN_CLIENT_ID = process.env.KEYCLOAK_BACKEND_ADMIN_CLIENT_ID || 'printsetu-backend-admin';
const ADMIN_CLIENT_SECRET = process.env.KEYCLOAK_BACKEND_ADMIN_CLIENT_SECRET || '';
const ADMIN_API = `${KEYCLOAK_BASE_URL}/admin/realms/${KEYCLOAK_REALM}`;

async function getServiceToken(): Promise<string> {
  const { data } = await axios.post(
    `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: ADMIN_CLIENT_ID,
      client_secret: ADMIN_CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );
  return data.access_token;
}

/**
 * Test-only helper. The app's own KeycloakAdminService.provisionUser
 * (src/auth/keycloak-admin.service.ts) always sets a *temporary* password
 * — correct production behavior, since a real admin-created account must
 * force a password change on first login. The password-grant login this
 * e2e suite uses to fetch tokens can't complete that required-action web
 * flow, so purely for test setup we clear the "temporary" flag right
 * after provisioning, using the same service-account credentials the
 * backend itself uses (KEYCLOAK_BACKEND_ADMIN_CLIENT_ID/SECRET). This
 * never touches application code or production behavior.
 */
export async function makeTestPasswordPermanent(
  keycloakUserId: string,
  password: string,
): Promise<void> {
  const token = await getServiceToken();
  await axios.put(
    `${ADMIN_API}/users/${keycloakUserId}/reset-password`,
    { type: 'password', value: password, temporary: false },
    { headers: { Authorization: `Bearer ${token}` } },
  );
}
