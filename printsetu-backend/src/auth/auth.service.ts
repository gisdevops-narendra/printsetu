import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AppConfig } from '../config/configuration';
import { UnauthenticatedException } from '../common/exceptions/app.exceptions';

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

/**
 * Thin proxy in front of Keycloak's token endpoint (Direct Access Grants),
 * so the Angular admin/shopkeeper apps have a same-origin /api/auth/login
 * to call rather than talking to Keycloak directly. Keycloak remains the
 * sole holder of credentials — this service never sees or stores a
 * password beyond the single forwarded request.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async login(username: string, password: string): Promise<TokenResponse> {
    const kc = this.config.get('keycloak', { infer: true });
    try {
      const { data } = await axios.post(
        kc.tokenUrl,
        new URLSearchParams({
          grant_type: 'password',
          client_id: kc.frontendClientId,
          username,
          password,
          scope: 'openid',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      return this.toTokenResponse(data);
    } catch (error) {
      this.logger.warn(`Login failed for ${username}: ${(error as Error).message}`);
      throw new UnauthenticatedException('Invalid username or password.');
    }
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

  private toTokenResponse(data: any): TokenResponse {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
    };
  }
}
