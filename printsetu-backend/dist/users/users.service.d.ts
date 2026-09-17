import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/request-context';
import { KeycloakTokenClaims } from '../auth/keycloak-token-verifier.service';
export declare class UsersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    resolveFromKeycloakClaims(claims: KeycloakTokenClaims): Promise<AuthenticatedUser>;
}
