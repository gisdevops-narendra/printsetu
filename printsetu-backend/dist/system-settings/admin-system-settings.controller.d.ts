import { Request } from 'express';
import { SystemSettingsService } from './system-settings.service';
import { UpdateSystemSettingDto } from './dto/system-setting.dto';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/request-context';
export declare class AdminSystemSettingsController {
    private readonly settings;
    private readonly audit;
    constructor(settings: SystemSettingsService, audit: AuditService);
    list(): Promise<{
        key: string;
        valueJson: import("@prisma/client/runtime/library").JsonValue;
        updatedAt: Date;
    }[]>;
    get(key: string): Promise<{
        key: string;
        value: {} | undefined;
    }>;
    set(key: string, dto: UpdateSystemSettingDto, user: AuthenticatedUser, req: Request): Promise<{
        key: string;
        valueJson: import("@prisma/client/runtime/library").JsonValue;
        updatedAt: Date;
    }>;
}
