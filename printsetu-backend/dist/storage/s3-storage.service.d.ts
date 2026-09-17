import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { IStorageService, PutObjectInput } from './storage.interface';
export declare class S3StorageService implements IStorageService {
    private readonly config;
    private readonly logger;
    private readonly client;
    private readonly bucket;
    private readonly defaultTtl;
    private readonly sseEnabled;
    constructor(config: ConfigService<AppConfig, true>);
    putObject({ key, body, contentType }: PutObjectInput): Promise<void>;
    getObject(key: string): Promise<Buffer>;
    getSignedDownloadUrl(key: string, ttlSeconds?: number): Promise<string>;
    deleteObject(key: string): Promise<void>;
    objectExists(key: string): Promise<boolean>;
}
