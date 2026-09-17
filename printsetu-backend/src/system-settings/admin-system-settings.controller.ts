import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { Request } from 'express';
import { SystemSettingsService } from './system-settings.service';
import { UpdateSystemSettingDto } from './dto/system-setting.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/request-context';
import { AppNotFoundException } from '../common/exceptions/app.exceptions';

/** SRS §6 "System settings" — admin-only, platform-wide key/value store. */
@Controller('admin/settings')
@Roles('ADMIN')
export class AdminSystemSettingsController {
  constructor(
    private readonly settings: SystemSettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.settings.list();
  }

  @Get(':key')
  async get(@Param('key') key: string) {
    const value = await this.settings.get(key);
    if (value === null) throw new AppNotFoundException(`No setting stored for "${key}".`);
    return { key, value };
  }

  @Put(':key')
  async set(
    @Param('key') key: string,
    @Body() dto: UpdateSystemSettingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const updated = await this.settings.set(key, dto.value);
    await this.audit.log({
      actorUserId: user.id,
      action: 'SYSTEM_SETTING_UPDATED',
      entityType: 'system_setting',
      entityId: key,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { key, value: dto.value },
    });
    return updated;
  }
}
