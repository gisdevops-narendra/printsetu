import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
export interface TokenResponse {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: string;
}
export declare class AuthService {
    private readonly config;
    private readonly logger;
    constructor(config: ConfigService<AppConfig, true>);
    login(username: string, password: string): Promise<TokenResponse>;
    refresh(refreshToken: string): Promise<TokenResponse>;
    private toTokenResponse;
}
