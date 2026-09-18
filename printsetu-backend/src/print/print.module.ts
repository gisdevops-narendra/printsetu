import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrintQuoteService } from './print-quote.service';
import { PrintQuoteController } from './print-quote.controller';
import { PrintJobsService } from './print-jobs.service';
import { PrintJobsRepository } from './print-jobs.repository';
import { PrintEditService } from './print-edit.service';
import { PrintJobsController, ShopPrintJobsController } from './print-jobs.controller';
import { PrintJobsProcessor } from './print-jobs.processor';
import { PRINT_DISPATCH_QUEUE } from './print-queue.constants';
import { PricingModule } from '../pricing/pricing.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [BullModule.registerQueue({ name: PRINT_DISPATCH_QUEUE }), PricingModule, StorageModule],
  controllers: [PrintQuoteController, PrintJobsController, ShopPrintJobsController],
  providers: [PrintQuoteService, PrintJobsService, PrintJobsRepository, PrintEditService, PrintJobsProcessor],
  exports: [PrintJobsService],
})
export class PrintModule {}
