import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailMessage, MailService } from '../mail/mail.service';
import {
  EmailSendFailedException,
  InvalidOtpException,
  OtpResendTooSoonException,
} from '../common/exceptions/app.exceptions';

export const OTP_VALID_MINUTES = 10;
export const OTP_RESEND_AFTER_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;

/** What a code proves: that the person owns the email they are registering with, or resetting the password of. */
export type OtpPurpose = 'REGISTRATION' | 'PASSWORD_RESET';

export interface OtpSent {
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

const hashCode = (purpose: OtpPurpose, email: string, code: string): string =>
  createHash('sha256').update(`${purpose}:${email}:${code}`).digest('hex');

/**
 * 6-digit codes emailed to prove someone owns an address (shop registration,
 * forgot password). One live code per purpose + email: "Resend" replaces it,
 * but not within OTP_RESEND_AFTER_SECONDS. Only the code's hash is stored,
 * codes expire after OTP_VALID_MINUTES, and after OTP_MAX_ATTEMPTS wrong
 * tries a code stops working. Callers check who may receive a code; this
 * service only issues and checks them.
 */
@Injectable()
export class EmailOtpService {
  private readonly logger = new Logger(EmailOtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Emails a fresh code to `email` (already trimmed + lower-cased), built into a message by `buildMessage`. */
  async send(
    purpose: OtpPurpose,
    email: string,
    buildMessage: (code: string, validMinutes: number) => MailMessage,
  ): Promise<OtpSent> {
    const key = { purpose_email: { purpose, email } };
    const existing = await this.prisma.emailVerification.findUnique({ where: key });
    if (existing) {
      const waitMs = existing.sentAt.getTime() + OTP_RESEND_AFTER_SECONDS * 1000 - Date.now();
      if (waitMs > 0) throw new OtpResendTooSoonException(Math.ceil(waitMs / 1000));
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const now = new Date();
    const record = {
      codeHash: hashCode(purpose, email, code),
      expiresAt: new Date(now.getTime() + OTP_VALID_MINUTES * 60_000),
      attempts: 0,
      sentAt: now,
    };
    await this.prisma.emailVerification.upsert({
      where: key,
      create: { purpose, email, ...record },
      update: record,
    });

    try {
      await this.mail.send(buildMessage(code, OTP_VALID_MINUTES));
    } catch (err) {
      this.logger.error(
        `Could not send the ${purpose} code to ${email}: ${(err as Error).message}`,
      );
      // Let them retry straight away rather than wait out the resend timer for an email that never left.
      await this.prisma.emailVerification.delete({ where: key }).catch(() => undefined);
      throw new EmailSendFailedException();
    }
    return this.sentResponse();
  }

  /** What send() answers; also returned as-is when the caller decides not to send (so nothing is revealed). */
  sentResponse(): OtpSent {
    return {
      expiresInSeconds: OTP_VALID_MINUTES * 60,
      resendAfterSeconds: OTP_RESEND_AFTER_SECONDS,
    };
  }

  /** Throws InvalidOtpException unless `code` is the live code for `email`. Doesn't use it up: see consume(). */
  async verify(purpose: OtpPurpose, email: string, code: string): Promise<void> {
    const key = { purpose_email: { purpose, email } };
    const record = await this.prisma.emailVerification.findUnique({ where: key });
    if (!record) {
      throw new InvalidOtpException('Please ask for a verification code first.');
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      throw new InvalidOtpException('This code has expired. Tap "Resend code" to get a new one.');
    }
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      throw new InvalidOtpException('Too many wrong codes. Tap "Resend code" to get a new one.');
    }
    const expected = Buffer.from(record.codeHash, 'hex');
    const given = Buffer.from(hashCode(purpose, email, code), 'hex');
    if (!timingSafeEqual(expected, given)) {
      await this.prisma.emailVerification.update({
        where: key,
        data: { attempts: { increment: 1 } },
      });
      throw new InvalidOtpException();
    }
  }

  /** Removes the code once it has done its job, so it can't be used again. */
  async consume(purpose: OtpPurpose, email: string): Promise<void> {
    await this.prisma.emailVerification.deleteMany({ where: { purpose, email } });
  }
}
