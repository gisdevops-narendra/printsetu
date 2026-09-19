import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { KeycloakAdminService } from '../auth/keycloak-admin.service';
import { AppNotFoundException } from '../common/exceptions/app.exceptions';
import { CreateUserDto } from './dto/admin-user.dto';
import { RoleName, UserStatus } from '@prisma/client';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) {}

  async list(shopId?: string) {
    return this.prisma.user.findMany({
      where: shopId ? { shopId } : {},
      include: { role: true, shop: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Creates both the Keycloak login and the local role/shop-scoped record.
   * Always a SHOPKEEPER: the platform has exactly one ADMIN account, seeded
   * directly in Keycloak, so there is no path here to mint another one.
   */
  async create(dto: CreateUserDto) {
    const role = await this.prisma.role.findUnique({ where: { name: RoleName.SHOPKEEPER } });
    if (!role) throw new AppNotFoundException('Role SHOPKEEPER is not seeded.');

    const temporaryPassword = randomBytes(9).toString('base64url');
    const keycloakUserId = await this.keycloakAdmin.provisionUser({
      email: dto.email,
      firstName: dto.name.split(' ')[0] || dto.name,
      lastName: dto.name.split(' ').slice(1).join(' ') || '-',
      role: RoleName.SHOPKEEPER,
      temporaryPassword,
    });

    const user = await this.prisma.user.create({
      data: {
        shopId: dto.shopId,
        roleId: role.id,
        name: dto.name,
        email: dto.email,
        mobile: dto.mobile,
        keycloakUserId,
        status: UserStatus.ACTIVE,
      },
    });

    return { ...user, temporaryPassword };
  }

  async setStatus(id: string, status: UserStatus) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new AppNotFoundException('User not found.');
    if (user.keycloakUserId) {
      if (status === UserStatus.DISABLED) await this.keycloakAdmin.disableUser(user.keycloakUserId);
      else await this.keycloakAdmin.enableUser(user.keycloakUserId);
    }
    return this.prisma.user.update({ where: { id }, data: { status } });
  }
}
