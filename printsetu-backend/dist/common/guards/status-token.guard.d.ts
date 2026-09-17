import { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
export declare class StatusTokenGuard implements CanActivate {
    private readonly config;
    constructor(config: ConfigService<AppConfig, true>);
    canActivate(context: ExecutionContext): boolean;
}
