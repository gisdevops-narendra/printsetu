"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var S3StorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3StorageService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
let S3StorageService = S3StorageService_1 = class S3StorageService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(S3StorageService_1.name);
        const storageConfig = this.config.get('storage', { infer: true });
        this.bucket = storageConfig.bucket;
        this.defaultTtl = storageConfig.signedUrlTtlSeconds;
        this.sseEnabled = storageConfig.driver !== 's3-minio';
        this.client = new client_s3_1.S3Client({
            region: storageConfig.region,
            endpoint: storageConfig.endpoint,
            forcePathStyle: storageConfig.forcePathStyle,
            credentials: {
                accessKeyId: storageConfig.accessKeyId,
                secretAccessKey: storageConfig.secretAccessKey,
            },
        });
    }
    async putObject({ key, body, contentType }) {
        await this.client.send(new client_s3_1.PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            ...(this.sseEnabled ? { ServerSideEncryption: 'AES256' } : {}),
        }));
        this.logger.log(`Stored object ${key} (${body.length} bytes)`);
    }
    async getObject(key) {
        const { Body } = await this.client.send(new client_s3_1.GetObjectCommand({ Bucket: this.bucket, Key: key }));
        if (!Body)
            throw new Error(`Object ${key} has no body.`);
        const bytes = await Body.transformToByteArray();
        return Buffer.from(bytes);
    }
    async getSignedDownloadUrl(key, ttlSeconds) {
        const command = new client_s3_1.GetObjectCommand({ Bucket: this.bucket, Key: key });
        return (0, s3_request_presigner_1.getSignedUrl)(this.client, command, { expiresIn: ttlSeconds ?? this.defaultTtl });
    }
    async deleteObject(key) {
        await this.client.send(new client_s3_1.DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
        this.logger.log(`Deleted object ${key}`);
    }
    async objectExists(key) {
        try {
            await this.client.send(new client_s3_1.HeadObjectCommand({ Bucket: this.bucket, Key: key }));
            return true;
        }
        catch {
            return false;
        }
    }
};
exports.S3StorageService = S3StorageService;
exports.S3StorageService = S3StorageService = S3StorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], S3StorageService);
//# sourceMappingURL=s3-storage.service.js.map