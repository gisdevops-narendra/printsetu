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
 * Test-only helper. New accounts only come from shop self-registration,
 * which sets a permanent, user-chosen password. Accounts created before
 * that (by an admin, with a temporary password) can still exist, so this
 * puts a registered account back into that legacy state to exercise the
 * forced password-change flow that still serves them.
 */
export async function makeTestPasswordTemporary(
  keycloakUserId: string,
  password: string,
): Promise<void> {
  const token = await getServiceToken();
  await axios.put(
    `${ADMIN_API}/users/${keycloakUserId}/reset-password`,
    { type: 'password', value: password, temporary: true },
    { headers: { Authorization: `Bearer ${token}` } },
  );
}
