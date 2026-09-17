import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service';
import { StorageModule } from '../storage/storage.module';
import { PrintJobsRepository } from '../print/print-jobs.repository';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [StorageModule, SystemSettingsModule],
  providers: [RetentionService, PrintJobsRepository],
})
export class RetentionModule {}
