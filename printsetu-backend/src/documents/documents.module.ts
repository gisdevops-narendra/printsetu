import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { ShopDocumentsController } from './shop-documents.controller';
import { FileValidationService } from './file-validation.service';
import { AnalysisClientService } from './analysis-client.service';
import { DocumentsRepository } from './documents.repository';
import { DocumentAnalysisProcessor } from './document-analysis.processor';
import { DOCUMENT_ANALYSIS_QUEUE } from './document-queue.constants';
import { StorageModule } from '../storage/storage.module';
import { QrModule } from '../qr/qr.module';

@Module({
  imports: [BullModule.registerQueue({ name: DOCUMENT_ANALYSIS_QUEUE }), StorageModule, QrModule],
  controllers: [DocumentsController, ShopDocumentsController],
  providers: [
    DocumentsService,
    FileValidationService,
    AnalysisClientService,
    DocumentsRepository,
    DocumentAnalysisProcessor,
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
