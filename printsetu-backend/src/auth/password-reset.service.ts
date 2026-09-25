import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { passwordChangedEmail, passwordResetOtpEmail } from '../mail/mail-templates';
import { InvalidOtpException } from '../common/exceptions/app.exceptions';
import { AuthService, TokenResponse } from './auth.service';
import { KeycloakAdminService } from './keycloak-admin.service';
import { EmailOtpService, OtpSent } from './email-otp.service';

/**
 * "Forgot password?" on the sign-in screen: a 6-digit code is emailed to the
 * account's address, and entering it with a new password sets that password
 * in Keycloak and signs the user straight in.
 *
 * Never reveals whether an email has an account: an unknown or turned-off
 * account gets the same "code sent" answer (but no email), and then the same
 * "code is not correct" error as a wrong code.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: EmailOtpService,
    private readonly keycloakAdmin: KeycloakAdminService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async sendCode(rawEmail: string): Promise<OtpSent> {
    const email = rawEmail.trim().toLowerCase();
    if (!(await this.findResettableUser(email))) {
      this.logger.log(`Password reset asked for ${email}: no active account, no email sent.`);
      return this.otp.sentResponse();
    }
    return this.otp.send('PASSWORD_RESET', email, (code, minutes) =>
      passwordResetOtpEmail(email, code, minutes),
    );
  }

  async reset(
    rawEmail: string,
    code: string,
    newPassword: string,
    context: { ip?: string; userAgent?: string },
  ): Promise<TokenResponse> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.findResettableUser(email);
    if (!user) throw new InvalidOtpException();
    await this.otp.verify('PASSWORD_RESET', email, code);

    await this.keycloakAdmin.setPassword(user.keycloakUserId, newPassword, false);
    // A pending temporary password is replaced too, so drop the admin-visible copy of it.
    await this.usersService.clearPendingPasswordChange(user.id);
    await this.otp.consume('PASSWORD_RESET', email);

    await this.audit.log({
      actorUserId: user.id,
      shopId: user.shopId ?? undefined,
      action: 'PASSWORD_RESET',
      entityType: 'user',
      entityId: user.id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { email },
    });
    void this.sendChangedNotice(email, user.name);

    return this.authService.signIn(email, newPassword);
  }

  private async findResettableUser(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, shopId: true, keycloakUserId: true, status: true },
    });
    if (!user?.keycloakUserId || user.status !== UserStatus.ACTIVE) return null;
    return { ...user, keycloakUserId: user.keycloakUserId };
  }

  /** Tells the owner of the address their password changed, so a reset they didn't make doesn't go unnoticed. Best effort. */
  private async sendChangedNotice(email: string, name: string): Promise<void> {
    try {
      const changedAt = new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: this.config.get('shopTimeZone', { infer: true }),
      }).format(new Date());
      const loginUrl = `${this.config.get('appBaseUrl', { infer: true })}/login`;
      await this.mail.send(passwordChangedEmail({ to: email, name, changedAt, loginUrl }));
    } catch (err) {
      this.logger.error(
        `Could not send the password-changed email to ${email}: ${(err as Error).message}`,
      );
    }
  }
}
