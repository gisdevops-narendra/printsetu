import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { AppConfig } from '../config/configuration';

export interface KeycloakTokenClaims {
  sub: string;
  email: string;
  preferred_username: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: { roles: string[] };
  exp: number;
  iss: string;
}

@Injectable()
export class KeycloakTokenVerifierService {
  private readonly jwks: JwksClient;
  private readonly issuer: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const kc = this.config.get('keycloak', { infer: true });
    this.issuer = kc.issuer;
    this.jwks = new JwksClient({
      jwksUri: kc.jwksUri,
      cache: true,
      cacheMaxAge: 10 * 60 * 1000,
      rateLimit: true,
    });
  }

  async verify(token: string): Promise<KeycloakTokenClaims> {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
      throw new Error('Malformed access token');
    }
    const key = await this.jwks.getSigningKey(decoded.header.kid);
    const publicKey = key.getPublicKey();
    return jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: this.issuer,
    }) as unknown as KeycloakTokenClaims;
  }
}
