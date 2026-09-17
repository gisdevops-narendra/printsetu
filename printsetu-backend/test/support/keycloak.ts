import axios from 'axios';

const KEYCLOAK_BASE_URL = process.env.KEYCLOAK_BASE_URL || 'http://localhost:58080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'printsetu';

/**
 * Fetches a real OIDC access token from the dev Keycloak instance using the
 * password grant against the public `printsetu-frontend` client (the same
 * client + demo users seeded by keycloak/printsetu-realm.json and
 * prisma/seed.ts). Using real tokens instead of a stubbed guard means these
 * e2e tests exercise the actual KeycloakAuthGuard/RolesGuard/UsersService
 * resolution path, not a bypass of it.
 */
export async function getAccessToken(username: string, password: string): Promise<string> {
  const { data } = await axios.post(
    `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
    new URLSearchParams({
      grant_type: 'password',
      client_id: 'printsetu-frontend',
      username,
      password,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );
  return data.access_token;
}
