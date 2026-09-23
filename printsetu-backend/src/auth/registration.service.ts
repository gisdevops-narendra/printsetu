import { Injectable } from '@nestjs/common';
import { Prisma, RoleName, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopsService } from '../shops/shops.service';
import { AuditService } from '../audit/audit.service';
import { AppNotFoundException, EmailAlreadyRegisteredException } from '../common/exceptions/app.exceptions';
import { AuthService, TokenResponse } from './auth.service';
import { KeycloakAdminService } from './keycloak-admin.service';
import { RegisterShopDto } from './dto/register.dto';

/**
 * Shop self-registration from the login screen — the only way shops and
 * shopkeeper accounts come into existence. Creates the Keycloak login
 * (with the password the shopkeeper chose, no temporary password), then
 * the shop and its SHOPKEEPER user in one DB transaction, then signs the
 * new user straight in. A DB failure rolls back the Keycloak user too.
 */
@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shopsService: ShopsService,
    private readonly keycloakAdmin: KeycloakAdminService,
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  async register(
    dto: RegisterShopDto,
    context: { ip?: string; userAgent?: string },
  ): Promise<TokenResponse & { shopId: string }> {
    const email = dto.email.trim().toLowerCase();
    const ownerName = dto.ownerName.trim();
    const mobile = dto.mobile.trim();

    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new EmailAlreadyRegisteredException();
    }
    const role = await this.prisma.role.findUnique({ where: { name: RoleName.SHOPKEEPER } });
    if (!role) throw new AppNotFoundException('Role SHOPKEEPER is not seeded.');

    const keycloakUserId = await this.keycloakAdmin.createUser({
      email,
      firstName: ownerName.split(' ')[0] || ownerName,
      lastName: ownerName.split(' ').slice(1).join(' ') || '-',
      role: RoleName.SHOPKEEPER,
      password: dto.password,
    });

    let shop: { id: string; name: string; shopCode: string };
    let userId: string;
    try {
      ({ shop, userId } = await this.prisma.$transaction(async (tx) => {
        const created = await this.shopsService.create(
          {
            name: dto.shopName.trim(),
            ownerName,
            mobile,
            email,
            address: dto.address.trim(),
            city: dto.city.trim(),
          },
          tx,
        );
        const user = await tx.user.create({
          data: {
            shopId: created.id,
            roleId: role.id,
            name: ownerName,
            email,
            mobile,
            keycloakUserId,
            status: UserStatus.ACTIVE,
          },
        });
        return { shop: created, userId: user.id };
      }));
    } catch (error) {
      await this.keycloakAdmin.deleteUser(keycloakUserId);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new EmailAlreadyRegisteredException();
      }
      throw error;
    }

    await this.audit.log({
      actorUserId: userId,
      shopId: shop.id,
      action: 'SHOP_REGISTERED',
      entityType: 'shop',
      entityId: shop.id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { name: shop.name, shopCode: shop.shopCode, email },
    });

    const tokens = await this.authService.signIn(email, dto.password);
    return { ...tokens, shopId: shop.id };
  }
}
