"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DocumentAnalysisProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentAnalysisProcessor = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const storage_interface_1 = require("../storage/storage.interface");
const analysis_client_service_1 = require("./analysis-client.service");
const documents_repository_1 = require("./documents.repository");
const document_queue_constants_1 = require("./document-queue.constants");
let DocumentAnalysisProcessor = DocumentAnalysisProcessor_1 = class DocumentAnalysisProcessor extends bullmq_1.WorkerHost {
    constructor(prisma, repo, storage, analysisClient) {
        super();
        this.prisma = prisma;
        this.repo = repo;
        this.storage = storage;
        this.analysisClient = analysisClient;
        this.logger = new common_1.Logger(DocumentAnalysisProcessor_1.name);
    }
    async process(job) {
        const { documentId } = job.data;
        this.logger.log(`Analysis attempt ${job.attemptsMade + 1} for document ${documentId}`);
        const document = await this.prisma.document.findUnique({ where: { id: documentId } });
        if (!document || document.status === client_1.DocumentStatus.DELETED) {
            return;
        }
        if (document.status === client_1.DocumentStatus.UPLOADED ||
            document.status === client_1.DocumentStatus.ANALYSIS_FAILED) {
            await this.repo.transition({
                documentId,
                from: document.status,
                to: client_1.DocumentStatus.PROCESSING,
            });
        }
        else if (document.status !== client_1.DocumentStatus.PROCESSING) {
            return;
        }
        const buffer = await this.storage.getObject(document.s3Key);
        const result = await this.analysisClient.analyze(buffer, document.mimeType, document.originalName);
        if (!result) {
            throw new Error(`Analysis service did not return a result for document ${documentId}.`);
        }
        await this.repo.transition({
            documentId,
            from: client_1.DocumentStatus.PROCESSING,
            to: client_1.DocumentStatus.PROCESSED,
            data: {
                pageCount: result.pageCount,
                colorPages: result.colorPages,
                colorDetectionConfidence: result.confidence,
            },
        });
    }
    async onFailed(job) {
        if (!job)
            return;
        const maxAttempts = job.opts.attempts ?? 1;
        if (job.attemptsMade < maxAttempts) {
            return;
        }
        const { documentId } = job.data;
        this.logger.error(`Document ${documentId} analysis failed permanently after ${job.attemptsMade} attempt(s).`);
        const document = await this.prisma.document.findUnique({ where: { id: documentId } });
        if (!document || document.status !== client_1.DocumentStatus.PROCESSING) {
            return;
        }
        await this.repo.transition({
            documentId,
            from: client_1.DocumentStatus.PROCESSING,
            to: client_1.DocumentStatus.ANALYSIS_FAILED,
        });
    }
};
exports.DocumentAnalysisProcessor = DocumentAnalysisProcessor;
__decorate([
    (0, bullmq_1.OnWorkerEvent)('failed'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DocumentAnalysisProcessor.prototype, "onFailed", null);
exports.DocumentAnalysisProcessor = DocumentAnalysisProcessor = DocumentAnalysisProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(document_queue_constants_1.DOCUMENT_ANALYSIS_QUEUE),
    __param(2, (0, common_1.Inject)(storage_interface_1.STORAGE_SERVICE)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        documents_repository_1.DocumentsRepository, Object, analysis_client_service_1.AnalysisClientService])
], DocumentAnalysisProcessor);
//# sourceMappingURL=document-analysis.processor.js.map