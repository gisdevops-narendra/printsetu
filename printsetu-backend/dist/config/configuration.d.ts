export interface AppConfig {
    env: string;
    port: number;
    corsAllowedOrigins: string[];
    database: {
        url: string;
    };
    redis: {
        host: string;
        port: number;
        url: string;
    };
    storage: {
        driver: string;
        endpoint?: string;
        region: string;
        accessKeyId: string;
        secretAccessKey: string;
        bucket: string;
        forcePathStyle: boolean;
        signedUrlTtlSeconds: number;
    };
    keycloak: {
        baseUrl: string;
        realm: string;
        frontendClientId: string;
        backendAdminClientId: string;
        backendAdminClientSecret: string;
        issuer: string;
        jwksUri: string;
        tokenUrl: string;
        adminApiBaseUrl: string;
    };
    security: {
        statusTokenSecret: string;
        agentTokenSecret: string;
        maxUploadSizeBytes: number;
        rateLimitTtlSeconds: number;
        rateLimitMax: number;
    };
    retention: {
        defaultMinutes: number;
    };
    docAnalysis: {
        url: string;
    };
}
declare const _default: () => AppConfig;
export default _default;
