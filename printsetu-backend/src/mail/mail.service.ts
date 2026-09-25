import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { AppConfig } from '../config/configuration';

export interface MailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends email over SMTP (SMTP_HOST etc. in .env). With no SMTP_HOST set,
 * nothing is sent: the message is written to the backend log instead, so
 * local development works without a mail server (the OTP shows in the log).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const mail = config.get('mail', { infer: true });
    this.from = mail.from;
    this.transporter = mail.host
      ? createTransport({
          host: mail.host,
          port: mail.port,
          secure: mail.secure,
          auth: mail.user ? { user: mail.user, pass: mail.pass } : undefined,
        })
      : null;
    if (!this.transporter) {
      this.logger.warn(
        'SMTP_HOST is not set: emails will be written to this log instead of being sent.',
      );
    }
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.logger.log(
        `[email not sent: no SMTP] To: ${[message.to].flat().join(', ')} | ${message.subject}\n${message.text}`,
      );
      return;
    }
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}
