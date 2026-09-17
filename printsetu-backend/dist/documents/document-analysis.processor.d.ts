import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { IStorageService } from '../storage/storage.interface';
import { AnalysisClientService } from './analysis-client.service';
import { DocumentsRepository } from './documents.repository';
export interface DocumentAnalysisJobData {
    documentId: string;
}
export declare class DocumentAnalysisProcessor extends WorkerHost {
    private readonly prisma;
    private readonly repo;
    private readonly storage;
    private readonly analysisClient;
    private readonly logger;
    constructor(prisma: PrismaService, repo: DocumentsRepository, storage: IStorageService, analysisClient: AnalysisClientService);
    process(job: Job<DocumentAnalysisJobData>): Promise<void>;
    onFailed(job: Job<DocumentAnalysisJobData> | undefined): Promise<void>;
}
