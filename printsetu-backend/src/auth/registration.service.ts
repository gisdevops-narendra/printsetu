import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, RoleName, UserStatus } from '@prisma/client';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { ShopsService } from '../shops/shops.service';
import { AuditService } from '../audit/audit.service';
import {
  AppNotFoundException,
  EmailAlreadyRegisteredException,
} from '../common/exceptions/app.exceptions';
import { AuthService, TokenResponse } from './auth.service';
import { KeycloakAdminService } from './keycloak-admin.service';
import { RegisterShopDto } from './dto/register.dto';
import { EmailOtpService, OtpSent } from './email-otp.service';
import { MailService } from '../mail/mail.service';
import { newShopAdminEmail, registrationOtpEmail, welcomeEmail } from '../mail/mail-templates';

/**
 * Shop self-registration from the login screen — the only way shops and
 * shopkeeper accounts come into existence. Nothing is created until the
 * emailed OTP checks out (sendOtp / EmailOtpService). Creates the Keycloak login
 * (with the password the shopkeeper chose, no temporary password), then
 * the shop and its SHOPKEEPER user in one DB transaction, then signs the
 * new user straight in. A DB failure rolls back the Keycloak user too.
 * Afterwards the owner gets a welcome email and the admins a new-shop email
 * (neither carries the password).
 */
@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopsService: ShopsService,
    private readonly keycloakAdmin: KeycloakAdminService,
    private readonly authService: AuthService,
    private readonly audit: AuditService,
    private readonly otp: EmailOtpService,
    private readonly mail: MailService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Step 1 (and "Resend code"): emails a code to the address being registered, unless it already has an account. */
  async sendOtp(rawEmail: string): Promise<OtpSent> {
    const email = rawEmail.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new EmailAlreadyRegisteredException();
    }
    return this.otp.send('REGISTRATION', email, (code, minutes) =>
      registrationOtpEmail(email, code, minutes),
    );
  }

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
    await this.otp.verify('REGISTRATION', email, dto.otp);
    const role = await this.prisma.role.findUnique({ where: { name: RoleName.SHOPKEEPER } });
    if (!role) throw new AppNotFoundException('Role SHOPKEEPER is not seeded.');

    const keycloakUserId = await this.keycloakAdmin.createUser({
      email,
      firstName: ownerName.split(' ')[0] || ownerName,
      lastName: ownerName.split(' ').slice(1).join(' ') || '-',
      role: RoleName.SHOPKEEPER,
      password: dto.password,
    });

    let shop: { id: string; name: string; shopCode: string; createdAt: Date };
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
            district: dto.district,
            latitude: dto.latitude,
            longitude: dto.longitude,
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
    await this.otp.consume('REGISTRATION', email);
    void this.sendRegistrationEmails({
      email,
      ownerName,
      mobile,
      shopName: shop.name,
      address: [dto.address.trim(), dto.city.trim()].join(', '),
      registeredAt: shop.createdAt,
    });

    const tokens = await this.authService.signIn(email, dto.password);
    return { ...tokens, shopId: shop.id };
  }

  /** Welcome email to the owner + new-shop email to the admins. Best effort: the shop already exists, so a mail problem is only logged. */
  private async sendRegistrationEmails(p: {
    email: string;
    ownerName: string;
    mobile: string;
    shopName: string;
    address: string;
    registeredAt: Date;
  }): Promise<void> {
    const appBaseUrl = this.config.get('appBaseUrl', { infer: true });
    try {
      await this.mail.send(
        welcomeEmail({
          to: p.email,
          ownerName: p.ownerName,
          shopName: p.shopName,
          loginUrl: `${appBaseUrl}/login`,
        }),
      );
    } catch (err) {
      this.logger.error(
        `Could not send the welcome email to ${p.email}: ${(err as Error).message}`,
      );
    }

    try {
      const admins = await this.adminRecipients();
      if (!admins.length) {
        this.logger.warn(
          'No admin email to tell about the new shop: set ADMIN_NOTIFICATION_EMAILS.',
        );
        return;
      }
      await this.mail.send(
        newShopAdminEmail({
          to: admins,
          shopName: p.shopName,
          ownerName: p.ownerName,
          email: p.email,
          mobile: p.mobile,
          address: p.address,
          registeredAt: this.formatDateTime(p.registeredAt),
          adminUrl: `${appBaseUrl}/admin/shops`,
        }),
      );
    } catch (err) {
      this.logger.error(
        `Could not send the new-shop email to the admins: ${(err as Error).message}`,
      );
    }
  }

  private async adminRecipients(): Promise<string[]> {
    const configured = this.config.get('mail', { infer: true }).adminEmails;
    if (configured.length) return configured;
    const admins = await this.prisma.user.findMany({
      where: { role: { name: RoleName.ADMIN }, status: UserStatus.ACTIVE },
      select: { email: true },
    });
    return admins.map((a) => a.email);
  }

  private formatDateTime(date: Date): string {
    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: this.config.get('shopTimeZone', { infer: true }),
    }).format(date);
  }
}
