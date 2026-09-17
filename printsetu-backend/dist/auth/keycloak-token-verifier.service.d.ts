import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
export interface KeycloakTokenClaims {
    sub: string;
    email: string;
    preferred_username: string;
    name?: string;
    given_name?: string;
    family_name?: string;
    realm_access?: {
        roles: string[];
    };
    exp: number;
    iss: string;
}
export declare class KeycloakTokenVerifierService {
    private readonly config;
    private readonly jwks;
    private readonly issuer;
    constructor(config: ConfigService<AppConfig, true>);
    verify(token: string): Promise<KeycloakTokenClaims>;
}
