import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service';
import { StorageModule } from '../storage/storage.module';
import { PrintJobsRepository } from '../print/print-jobs.repository';

@Module({
  imports: [StorageModule],
  providers: [RetentionService, PrintJobsRepository],
})
export class RetentionModule {}
