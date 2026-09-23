import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AppConfig } from '../config/configuration';
import { RoleName } from '@prisma/client';
import { EmailAlreadyRegisteredException } from '../common/exceptions/app.exceptions';

/**
 * Thin wrapper around the Keycloak Admin REST API using the
 * `printsetu-backend-admin` service-account client (realm-management:
 * manage-users). Lets shop self-registration actually provision a login,
 * not just a local DB row — credentials
 * themselves still never touch our database (SRS §18).
 */
@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private async getServiceToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 5_000) {
      return this.cachedToken.token;
    }
    const kc = this.config.get('keycloak', { infer: true });
    const { data } = await axios.post(
      kc.tokenUrl,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: kc.backendAdminClientId,
        client_secret: kc.backendAdminClientSecret,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    this.cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return this.cachedToken.token;
  }

  private async authHeaders() {
    const token = await this.getServiceToken();
    return { Authorization: `Bearer ${token}` };
  }

  /**
   * Creates the Keycloak login for a self-registered shopkeeper with the
   * password they chose (permanent, so they can sign in straight away) and
   * assigns the realm role. Refuses an email Keycloak already knows rather
   * than taking over that existing account. Returns the Keycloak user id (sub).
   */
  async createUser(params: {
    email: string;
    firstName: string;
    lastName: string;
    role: RoleName;
    password: string;
  }): Promise<string> {
    const kc = this.config.get('keycloak', { infer: true });
    const headers = await this.authHeaders();

    const createResponse = await axios.post(
      `${kc.adminApiBaseUrl}/users`,
      {
        username: params.email,
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        enabled: true,
        emailVerified: true,
      },
      { headers, validateStatus: (s) => s === 201 || s === 409 },
    );
    if (createResponse.status === 409) throw new EmailAlreadyRegisteredException();

    const location = createResponse.headers.location as string;
    const keycloakUserId = location.substring(location.lastIndexOf('/') + 1);

    try {
      await this.setPassword(keycloakUserId, params.password, false);
      const roleResponse = await axios.get(`${kc.adminApiBaseUrl}/roles/${params.role}`, { headers });
      await axios.post(
        `${kc.adminApiBaseUrl}/users/${keycloakUserId}/role-mappings/realm`,
        [{ id: roleResponse.data.id, name: roleResponse.data.name }],
        { headers },
      );
    } catch (error) {
      await this.deleteUser(keycloakUserId);
      throw error;
    }

    return keycloakUserId;
  }

  /** Best-effort removal, used to roll back a registration that failed part-way. */
  async deleteUser(keycloakUserId: string): Promise<void> {
    const kc = this.config.get('keycloak', { infer: true });
    try {
      const headers = await this.authHeaders();
      await axios.delete(`${kc.adminApiBaseUrl}/users/${keycloakUserId}`, { headers });
    } catch (error) {
      this.logger.error(`Failed to delete Keycloak user ${keycloakUserId}: ${(error as Error).message}`);
    }
  }

  /**
   * Sets a user's password. `temporary: true` also arms Keycloak's
   * UPDATE_PASSWORD required action (a login attempt then succeeds
   * authentication-wise but is refused a token until the password is
   * changed); `temporary: false` clears that required action again, which
   * is what lets a fresh, self-chosen password log in normally (see
   * AuthService.changeTemporaryPassword and createUser).
   */
  async setPassword(keycloakUserId: string, password: string, temporary: boolean): Promise<void> {
    const kc = this.config.get('keycloak', { infer: true });
    const headers = await this.authHeaders();
    await axios.put(
      `${kc.adminApiBaseUrl}/users/${keycloakUserId}/reset-password`,
      { type: 'password', value: password, temporary },
      { headers },
    );
  }

  async disableUser(keycloakUserId: string): Promise<void> {
    const kc = this.config.get('keycloak', { infer: true });
    const headers = await this.authHeaders();
    await axios.put(`${kc.adminApiBaseUrl}/users/${keycloakUserId}`, { enabled: false }, { headers });
  }

  async enableUser(keycloakUserId: string): Promise<void> {
    const kc = this.config.get('keycloak', { infer: true });
    const headers = await this.authHeaders();
    await axios.put(`${kc.adminApiBaseUrl}/users/${keycloakUserId}`, { enabled: true }, { headers });
  }
}
