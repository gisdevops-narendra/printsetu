import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { KeycloakTokenVerifierService } from '../../auth/keycloak-token-verifier.service';
import { UsersService } from '../../users/users.service';
export declare class KeycloakAuthGuard implements CanActivate {
    private readonly reflector;
    private readonly verifier;
    private readonly usersService;
    constructor(reflector: Reflector, verifier: KeycloakTokenVerifierService, usersService: UsersService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
