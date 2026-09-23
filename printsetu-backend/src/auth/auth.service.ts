import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AppConfig } from '../config/configuration';
import { UnauthenticatedException, WeakPasswordException } from '../common/exceptions/app.exceptions';
import { UsersService } from '../users/users.service';
import { KeycloakAdminService } from './keycloak-admin.service';

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

/** Discriminant the frontend switches on: no tokens yet, show the change-password step. */
export interface PasswordChangeRequiredResult {
  requiresPasswordChange: true;
}

const ACCOUNT_NOT_FULLY_SET_UP = 'Account is not fully set up';

/**
 * Thin proxy in front of Keycloak's token endpoint (Direct Access Grants),
 * so the Angular admin/shopkeeper apps have a same-origin /api/auth/login
 * to call rather than talking to Keycloak directly. Keycloak remains the
 * sole holder of credentials — this service never stores a password
 * beyond the single forwarded request (the admin-visible "current
 * password" copy is a separate, deliberate exception — see
 * AdminUsersService / CredentialCipherService — and this service never
 * reads it either).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly usersService: UsersService,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) {}

  /**
   * A temp password (admin-created user, or one that hasn't been changed
   * yet) carries Keycloak's UPDATE_PASSWORD required action. Direct Access
   * Grants can't fulfil a required action, so Keycloak authenticates the
   * password correctly but refuses a token with `invalid_grant` /
   * "Account is not fully set up". We surface that as a distinct result
   * instead of a login failure, so the frontend can walk the user straight
   * into changing their password rather than a dead-end "wrong password".
   */
  async login(username: string, password: string): Promise<TokenResponse | PasswordChangeRequiredResult> {
    try {
      const { data } = await this.passwordGrant(username, password);
      return this.toTokenResponse(data);
    } catch (error) {
      if (await this.isPendingPasswordChange(username, error)) {
        return { requiresPasswordChange: true };
      }
      this.logger.warn(`Login failed for ${username}: ${(error as Error).message}`);
      throw new UnauthenticatedException('Invalid username or password.');
    }
  }

  /**
   * Completes the forced first-login flow: verifies the temporary password
   * against Keycloak itself (never against our own stored copy), sets the
   * new one as permanent (clearing the required action), forgets our
   * admin-visible copy of it, and signs the user straight in.
   */
  async changeTemporaryPassword(
    username: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<TokenResponse> {
    if (newPassword.length < 8) {
      throw new WeakPasswordException('Password must be at least 8 characters long.');
    }
    if (newPassword === currentPassword) {
      throw new WeakPasswordException('Choose a password different from your current one.');
    }

    const profile = await this.usersService.findAuthProfileByEmail(username);
    if (!profile?.keycloakUserId || profile.status !== 'ACTIVE') {
      throw new UnauthenticatedException('Invalid username or password.');
    }

    const currentPasswordValid = await this.verifyCredentials(username, currentPassword);
    if (!currentPasswordValid) {
      throw new UnauthenticatedException('Invalid username or password.');
    }

    await this.keycloakAdmin.setPassword(profile.keycloakUserId, newPassword, false);
    await this.usersService.clearPendingPasswordChange(profile.id);

    return this.signIn(username, newPassword);
  }

  /** Signs in with credentials known to be valid (e.g. right after registration). */
  async signIn(username: string, password: string): Promise<TokenResponse> {
    const { data } = await this.passwordGrant(username, password);
    return this.toTokenResponse(data);
  }

  async refresh(refreshToken: string): Promise<TokenResponse> {
    const kc = this.config.get('keycloak', { infer: true });
    try {
      const { data } = await axios.post(
        kc.tokenUrl,
        new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: kc.frontendClientId,
          refresh_token: refreshToken,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      return this.toTokenResponse(data);
    } catch (error) {
      this.logger.warn(`Refresh failed: ${(error as Error).message}`);
      throw new UnauthenticatedException('Invalid or expired refresh token.');
    }
  }

  /**
   * Sign-out: revokes the (offline) refresh token so the session really ends
   * in Keycloak, not just in the browser. Best effort — the client forgets
   * its tokens either way.
   */
  async logout(refreshToken: string): Promise<void> {
    const kc = this.config.get('keycloak', { infer: true });
    try {
      await axios.post(
        kc.revokeUrl,
        new URLSearchParams({
          client_id: kc.frontendClientId,
          token: refreshToken,
          token_type_hint: 'refresh_token',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
    } catch (error) {
      this.logger.warn(`Token revocation failed: ${(error as Error).message}`);
    }
  }

  private passwordGrant(username: string, password: string) {
    const kc = this.config.get('keycloak', { infer: true });
    return axios.post(
      kc.tokenUrl,
      new URLSearchParams({
        grant_type: 'password',
        client_id: kc.frontendClientId,
        username,
        password,
        // offline_access: the refresh token outlives Keycloak's SSO session,
        // so users stay signed in until they sign out themselves.
        scope: 'openid offline_access',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
  }

  /** True if the password itself was correct, regardless of pending required actions. */
  private async verifyCredentials(username: string, password: string): Promise<boolean> {
    try {
      await this.passwordGrant(username, password);
      return true;
    } catch (error) {
      return this.isAccountNotFullySetUp(error);
    }
  }

  private isAccountNotFullySetUp(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;
    const data = error.response?.data as { error_description?: string } | undefined;
    return data?.error_description === ACCOUNT_NOT_FULLY_SET_UP;
  }

  /**
   * Defense in depth: only treat Keycloak's "not fully set up" error as
   * "please change your password" when our own record agrees a password
   * change is actually pending for this account, so an unrelated required
   * action (e.g. a future verify-email step) doesn't get misread as one.
   */
  private async isPendingPasswordChange(username: string, error: unknown): Promise<boolean> {
    if (!this.isAccountNotFullySetUp(error)) return false;
    const profile = await this.usersService.findAuthProfileByEmail(username);
    return !!profile?.mustChangePassword;
  }

  private toTokenResponse(data: any): TokenResponse {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
    };
  }
}
