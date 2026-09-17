import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppConfig } from '../config/configuration';
import { IStorageService, PutObjectInput } from './storage.interface';

/**
 * Single implementation for both local MinIO and real AWS S3 — both speak
 * the S3 API. Locally we set endpoint + forcePathStyle; against real AWS,
 * unset S3_ENDPOINT and let the SDK resolve the regional endpoint. No code
 * change needed to move environments, only .env values.
 */
@Injectable()
export class S3StorageService implements IStorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly defaultTtl: number;
  private readonly sseEnabled: boolean;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const storageConfig = this.config.get('storage', { infer: true });
    this.bucket = storageConfig.bucket;
    this.defaultTtl = storageConfig.signedUrlTtlSeconds;
    // SRS §19: "encryption ... at rest" — real AWS S3 supports SSE-S3
    // (AES256) with no extra setup. Local MinIO in this compose stack
    // isn't configured with a KMS/SSE backend, so this stays off for the
    // s3-minio driver and on for s3-aws; flip STORAGE_DRIVER to switch.
    this.sseEnabled = storageConfig.driver !== 's3-minio';
    this.client = new S3Client({
      region: storageConfig.region,
      endpoint: storageConfig.endpoint,
      forcePathStyle: storageConfig.forcePathStyle,
      credentials: {
        accessKeyId: storageConfig.accessKeyId,
        secretAccessKey: storageConfig.secretAccessKey,
      },
    });
  }

  async putObject({ key, body, contentType }: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(this.sseEnabled ? { ServerSideEncryption: 'AES256' as const } : {}),
      }),
    );
    this.logger.log(`Stored object ${key} (${body.length} bytes)`);
  }

  /** Fetches an object's bytes directly — used by the document-analysis worker (§10.1), which runs decoupled from the original upload request buffer. */
  async getObject(key: string): Promise<Buffer> {
    const { Body } = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!Body) throw new Error(`Object ${key} has no body.`);
    const bytes = await Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async getSignedDownloadUrl(key: string, ttlSeconds?: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: ttlSeconds ?? this.defaultTtl });
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    this.logger.log(`Deleted object ${key}`);
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}
