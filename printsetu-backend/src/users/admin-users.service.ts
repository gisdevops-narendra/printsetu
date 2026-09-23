import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KeycloakAdminService } from '../auth/keycloak-admin.service';
import { CredentialCipherService } from '../common/crypto/credential-cipher.service';
import { AppNotFoundException } from '../common/exceptions/app.exceptions';
import { UserStatus } from '@prisma/client';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keycloakAdmin: KeycloakAdminService,
    private readonly credentialCipher: CredentialCipherService,
  ) {}

  /**
   * Includes each user's *current* password (see prisma/schema.prisma
   * User.currentPasswordEnc) so an admin can look it up — but only while
   * it's still the one on file with Keycloak; it drops to `null` the
   * moment the user changes it (AuthService.changeTemporaryPassword).
   */
  async list(shopId?: string) {
    const users = await this.prisma.user.findMany({
      where: shopId ? { shopId } : {},
      include: { role: true, shop: true },
      orderBy: { createdAt: 'desc' },
    });
    return users.map(({ currentPasswordEnc, passwordHash, ...user }) => ({
      ...user,
      currentPassword: currentPasswordEnc ? this.credentialCipher.decrypt(currentPasswordEnc) : null,
    }));
  }

  async setStatus(id: string, status: UserStatus) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new AppNotFoundException('User not found.');
    if (user.keycloakUserId) {
      if (status === UserStatus.DISABLED) await this.keycloakAdmin.disableUser(user.keycloakUserId);
      else await this.keycloakAdmin.enableUser(user.keycloakUserId);
    }
    const updated = await this.prisma.user.update({ where: { id }, data: { status } });
    const { currentPasswordEnc, passwordHash, ...userWithoutSecrets } = updated;
    return userWithoutSecrets;
  }
}
