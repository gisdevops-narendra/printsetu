"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentsModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const documents_service_1 = require("./documents.service");
const documents_controller_1 = require("./documents.controller");
const shop_documents_controller_1 = require("./shop-documents.controller");
const file_validation_service_1 = require("./file-validation.service");
const analysis_client_service_1 = require("./analysis-client.service");
const documents_repository_1 = require("./documents.repository");
const document_analysis_processor_1 = require("./document-analysis.processor");
const document_queue_constants_1 = require("./document-queue.constants");
const storage_module_1 = require("../storage/storage.module");
const qr_module_1 = require("../qr/qr.module");
let DocumentsModule = class DocumentsModule {
};
exports.DocumentsModule = DocumentsModule;
exports.DocumentsModule = DocumentsModule = __decorate([
    (0, common_1.Module)({
        imports: [bullmq_1.BullModule.registerQueue({ name: document_queue_constants_1.DOCUMENT_ANALYSIS_QUEUE }), storage_module_1.StorageModule, qr_module_1.QrModule],
        controllers: [documents_controller_1.DocumentsController, shop_documents_controller_1.ShopDocumentsController],
        providers: [
            documents_service_1.DocumentsService,
            file_validation_service_1.FileValidationService,
            analysis_client_service_1.AnalysisClientService,
            documents_repository_1.DocumentsRepository,
            document_analysis_processor_1.DocumentAnalysisProcessor,
        ],
        exports: [documents_service_1.DocumentsService],
    })
], DocumentsModule);
//# sourceMappingURL=documents.module.js.map