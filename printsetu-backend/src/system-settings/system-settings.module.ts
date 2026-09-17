import { Module } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';
import { AdminSystemSettingsController } from './admin-system-settings.controller';

@Module({
  controllers: [AdminSystemSettingsController],
  providers: [SystemSettingsService],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
