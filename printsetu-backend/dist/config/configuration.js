"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = () => {
    const keycloakBaseUrl = process.env.KEYCLOAK_BASE_URL || 'http://localhost:8080';
    const realm = process.env.KEYCLOAK_REALM || 'printsetu';
    return {
        env: process.env.NODE_ENV || 'development',
        port: parseInt(process.env.BACKEND_PORT || '3000', 10),
        corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:4200')
            .split(',')
            .map((o) => o.trim()),
        database: {
            url: process.env.DATABASE_URL,
        },
        redis: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            url: process.env.REDIS_URL || 'redis://localhost:6379',
        },
        storage: {
            driver: process.env.STORAGE_DRIVER || 's3-minio',
            endpoint: process.env.S3_ENDPOINT || undefined,
            region: process.env.S3_REGION || 'us-east-1',
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            bucket: process.env.S3_BUCKET || 'printsetu-documents',
            forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || 'true') === 'true',
            signedUrlTtlSeconds: parseInt(process.env.S3_SIGNED_URL_TTL_SECONDS || '300', 10),
        },
        keycloak: {
            baseUrl: keycloakBaseUrl,
            realm,
            frontendClientId: process.env.KEYCLOAK_FRONTEND_CLIENT_ID || 'printsetu-frontend',
            backendAdminClientId: process.env.KEYCLOAK_BACKEND_ADMIN_CLIENT_ID || 'printsetu-backend-admin',
            backendAdminClientSecret: process.env.KEYCLOAK_BACKEND_ADMIN_CLIENT_SECRET || '',
            issuer: `${keycloakBaseUrl}/realms/${realm}`,
            jwksUri: `${keycloakBaseUrl}/realms/${realm}/protocol/openid-connect/certs`,
            tokenUrl: `${keycloakBaseUrl}/realms/${realm}/protocol/openid-connect/token`,
            adminApiBaseUrl: `${keycloakBaseUrl}/admin/realms/${realm}`,
        },
        security: {
            statusTokenSecret: process.env.STATUS_TOKEN_SECRET,
            agentTokenSecret: process.env.AGENT_TOKEN_SECRET,
            maxUploadSizeBytes: parseInt(process.env.MAX_UPLOAD_SIZE_BYTES || '26214400', 10),
            rateLimitTtlSeconds: parseInt(process.env.RATE_LIMIT_TTL_SECONDS || '60', 10),
            rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
        },
        retention: {
            defaultMinutes: parseInt(process.env.DEFAULT_RETENTION_MINUTES || '30', 10),
        },
        docAnalysis: {
            url: process.env.DOC_ANALYSIS_URL || 'http://localhost:8000',
        },
    };
};
//# sourceMappingURL=configuration.js.map