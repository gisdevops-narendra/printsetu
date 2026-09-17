import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UnauthenticatedException } from '../common/exceptions/app.exceptions';
import { AuthenticatedUser } from '../common/types/request-context';
import { KeycloakTokenClaims } from '../auth/keycloak-token-verifier.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Local `users` rows are the source of truth for role + shop assignment
   * (Admin Module §6 "User and role management"); Keycloak only owns
   * credentials (§18). A user must already exist locally — created by an
   * Admin or the seed script — for a Keycloak login to resolve to a
   * PrintSetu identity. First successful login backfills keycloakUserId.
   */
  async resolveFromKeycloakClaims(claims: KeycloakTokenClaims): Promise<AuthenticatedUser> {
    let user = await this.prisma.user.findUnique({
      where: { keycloakUserId: claims.sub },
      include: { role: true },
    });

    if (!user) {
      user = await this.prisma.user.findUnique({
        where: { email: claims.email },
        include: { role: true },
      });
      if (user) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { keycloakUserId: claims.sub, lastLoginAt: new Date() },
          include: { role: true },
        });
      }
    } else {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthenticatedException('No active PrintSetu account for this login.');
    }

    return {
      id: user.id,
      keycloakUserId: user.keycloakUserId as string,
      email: user.email,
      name: user.name,
      role: user.role.name,
      shopId: user.shopId,
    };
  }
}
