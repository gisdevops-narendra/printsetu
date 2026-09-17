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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const uuid_1 = require("uuid");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const storage_interface_1 = require("../storage/storage.interface");
const qr_service_1 = require("../qr/qr.service");
const file_validation_service_1 = require("./file-validation.service");
const notifications_service_1 = require("../notifications/notifications.service");
const app_exceptions_1 = require("../common/exceptions/app.exceptions");
const app_exceptions_2 = require("../common/exceptions/app.exceptions");
const signed_token_util_1 = require("../common/utils/signed-token.util");
const document_queue_constants_1 = require("./document-queue.constants");
const DOC_ACCESS_TOKEN_TTL_SECONDS = 30 * 60;
let DocumentsService = class DocumentsService {
    constructor(prisma, storage, qrService, fileValidation, notifications, config, analysisQueue) {
        this.prisma = prisma;
        this.storage = storage;
        this.qrService = qrService;
        this.fileValidation = fileValidation;
        this.notifications = notifications;
        this.config = config;
        this.analysisQueue = analysisQueue;
    }
    async upload(shopCode, file) {
        const { shopId } = await this.qrService.resolvePublicCode(shopCode);
        const settings = await this.prisma.printSettings.findUnique({ where: { shopId } });
        const maxSize = settings?.maxFileSizeBytes ?? this.config.get('security', { infer: true }).maxUploadSizeBytes;
        if (file.size > maxSize) {
            throw new app_exceptions_1.FileTooLargeException(`File exceeds the ${Math.floor(maxSize / (1024 * 1024))}MB limit for this shop.`);
        }
        const mimeType = await this.fileValidation.assertSafeAndSupported(file.buffer);
        const documentId = (0, uuid_1.v4)();
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
        const s3Key = `${shopId}/${documentId}/${safeName}`;
        await this.storage.putObject({ key: s3Key, body: file.buffer, contentType: mimeType });
        const document = await this.prisma.document.create({
            data: {
                id: documentId,
                shopId,
                originalName: file.originalname,
                s3Key,
                mimeType,
                sizeBytes: file.size,
                status: client_1.DocumentStatus.UPLOADED,
            },
        });
        await this.analysisQueue.add('analyze', { documentId: document.id }, document_queue_constants_1.DOCUMENT_ANALYSIS_JOB_OPTS);
        await this.notifications.record(shopId, null, 'UPLOAD_RECEIVED');
        const docAccessToken = (0, signed_token_util_1.signToken)({ shopId, documentId, exp: Math.floor(Date.now() / 1000) + DOC_ACCESS_TOKEN_TTL_SECONDS }, this.config.get('security', { infer: true }).statusTokenSecret);
        return {
            documentId: document.id,
            docAccessToken,
            originalName: document.originalName,
            sizeBytes: document.sizeBytes,
            mimeType: document.mimeType,
            pageCount: document.pageCount,
            colorPages: document.colorPages,
            colorDetectionConfidence: document.colorDetectionConfidence,
            status: document.status,
        };
    }
    async getForCustomer(documentId, claims) {
        const document = await this.prisma.document.findUnique({ where: { id: documentId } });
        if (!document)
            throw new app_exceptions_2.AppNotFoundException('Document not found.');
        if (claims.documentId !== documentId || claims.shopId !== document.shopId) {
            throw new app_exceptions_1.ShopAccessDeniedException('Status token does not grant access to this document.');
        }
        return document;
    }
    async getPreviewUrlForShop(documentId, shopId) {
        const document = await this.prisma.document.findUnique({ where: { id: documentId } });
        if (!document)
            throw new app_exceptions_2.AppNotFoundException('Document not found.');
        if (document.shopId !== shopId) {
            throw new app_exceptions_1.ShopAccessDeniedException('This document does not belong to your shop.');
        }
        if (document.status === client_1.DocumentStatus.DELETED) {
            throw new app_exceptions_2.AppNotFoundException('Document has been deleted per retention policy.');
        }
        const url = await this.storage.getSignedDownloadUrl(document.s3Key, 120);
        return { url, expiresInSeconds: 120 };
    }
};
exports.DocumentsService = DocumentsService;
exports.DocumentsService = DocumentsService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(storage_interface_1.STORAGE_SERVICE)),
    __param(6, (0, bullmq_1.InjectQueue)(document_queue_constants_1.DOCUMENT_ANALYSIS_QUEUE)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object, qr_service_1.QrService,
        file_validation_service_1.FileValidationService,
        notifications_service_1.NotificationsService,
        config_1.ConfigService,
        bullmq_2.Queue])
], DocumentsService);
//# sourceMappingURL=documents.service.js.map