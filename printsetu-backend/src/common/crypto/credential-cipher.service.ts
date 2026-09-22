import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { AppConfig } from '../../config/configuration';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * AES-256-GCM encrypt/decrypt for the one deliberate, scoped exception to
 * "Keycloak owns all credentials" (SRS §18): admins can view a shop user's
 * *current* password (see prisma/schema.prisma User.currentPasswordEnc).
 * Never used to make an auth decision — Keycloak remains the sole
 * authority for whether a password is actually correct.
 */
@Injectable()
export class CredentialCipherService implements OnModuleInit {
  private readonly logger = new Logger(CredentialCipherService.name);
  private key!: Buffer;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  onModuleInit(): void {
    const raw = this.config.get('security', { infer: true }).credentialEncryptionKey;
    if (!raw) {
      throw new Error(
        'CREDENTIAL_ENCRYPTION_KEY is not set. Generate one with: ' +
          `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
      );
    }
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error('CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).');
    }
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]).toString('base64');
  }

  /** Returns null (and logs a warning) rather than throwing on a corrupt/foreign value. */
  decrypt(encoded: string): string | null {
    try {
      const buf = Buffer.from(encoded, 'base64');
      const iv = buf.subarray(0, IV_LENGTH);
      const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
      const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch (error) {
      this.logger.warn(`Failed to decrypt a stored credential: ${(error as Error).message}`);
      return null;
    }
  }
}
