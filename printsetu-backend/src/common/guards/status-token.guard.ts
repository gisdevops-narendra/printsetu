import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken } from '../utils/signed-token.util';
import { UnauthenticatedException } from '../exceptions/app.exceptions';
import { StatusTokenClaims } from '../types/request-context';
import { AppConfig } from '../../config/configuration';

/**
 * Authenticates the no-login customer flow (SRS §5.2 / §8): a signed,
 * short-lived token issued on upload/quote/confirm stands in for an
 * account. Never trust client-supplied documentId/jobId alone — always
 * cross-check against the verified claims in the service layer.
 */
@Injectable()
export class StatusTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token =
      request.headers['x-status-token'] ||
      request.query?.token ||
      (request.body && request.body.statusToken);

    if (!token || typeof token !== 'string') {
      throw new UnauthenticatedException('Missing status token.');
    }
    try {
      const secret = this.config.get('security', { infer: true }).statusTokenSecret;
      request.statusToken = verifyToken<StatusTokenClaims>(token, secret);
      return true;
    } catch {
      throw new UnauthenticatedException('Invalid or expired status token.');
    }
  }
}
