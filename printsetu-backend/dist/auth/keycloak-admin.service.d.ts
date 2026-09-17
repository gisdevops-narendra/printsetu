import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { RoleName } from '@prisma/client';
export declare class KeycloakAdminService {
    private readonly config;
    private readonly logger;
    private cachedToken;
    constructor(config: ConfigService<AppConfig, true>);
    private getServiceToken;
    private authHeaders;
    provisionUser(params: {
        email: string;
        firstName: string;
        lastName: string;
        role: RoleName;
        temporaryPassword: string;
    }): Promise<string>;
    disableUser(keycloakUserId: string): Promise<void>;
    enableUser(keycloakUserId: string): Promise<void>;
}
