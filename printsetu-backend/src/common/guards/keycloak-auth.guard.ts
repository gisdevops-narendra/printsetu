import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { UnauthenticatedException } from '../exceptions/app.exceptions';
import { KeycloakTokenVerifierService } from '../../auth/keycloak-token-verifier.service';
import { UsersService } from '../../users/users.service';

@Injectable()
export class KeycloakAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: KeycloakTokenVerifierService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthenticatedException();
    }
    const token = authHeader.substring('Bearer '.length);

    try {
      const claims = await this.verifier.verify(token);
      request.user = await this.usersService.resolveFromKeycloakClaims(claims);
      return true;
    } catch {
      throw new UnauthenticatedException();
    }
  }
}
