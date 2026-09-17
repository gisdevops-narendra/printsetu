import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { KeycloakAdminService } from '../auth/keycloak-admin.service';
import { AppNotFoundException, InvalidPrintOptionException } from '../common/exceptions/app.exceptions';
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

  /** Creates both the Keycloak login and the local role/shop-scoped record. */
  async create(dto: CreateUserDto) {
    if (dto.role === RoleName.SHOPKEEPER && !dto.shopId) {
      throw new InvalidPrintOptionException('SHOPKEEPER users must be assigned to a shop.');
    }
    const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
    if (!role) throw new AppNotFoundException(`Role ${dto.role} is not seeded.`);

    const temporaryPassword = randomBytes(9).toString('base64url');
    const keycloakUserId = await this.keycloakAdmin.provisionUser({
      email: dto.email,
      firstName: dto.name.split(' ')[0] || dto.name,
      lastName: dto.name.split(' ').slice(1).join(' ') || '-',
      role: dto.role,
      temporaryPassword,
    });

    const user = await this.prisma.user.create({
      data: {
        shopId: dto.shopId ?? null,
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
