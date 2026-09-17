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
exports.DocumentsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const throttler_1 = require("@nestjs/throttler");
const multer_1 = require("multer");
const documents_service_1 = require("./documents.service");
const public_decorator_1 = require("../common/decorators/public.decorator");
const status_token_guard_1 = require("../common/guards/status-token.guard");
const status_token_decorator_1 = require("../common/decorators/status-token.decorator");
const HARD_UPLOAD_CEILING_BYTES = parseInt(process.env.MAX_UPLOAD_SIZE_BYTES || '26214400', 10);
let DocumentsController = class DocumentsController {
    constructor(documentsService) {
        this.documentsService = documentsService;
    }
    async upload(file, req) {
        const shopCode = req.body?.shopCode;
        if (!file) {
            throw new common_1.BadRequestException('No file was uploaded.');
        }
        if (!shopCode || typeof shopCode !== 'string') {
            throw new common_1.BadRequestException('shopCode is required.');
        }
        return this.documentsService.upload(shopCode, file);
    }
    async get(id, claims) {
        return this.documentsService.getForCustomer(id, claims);
    }
};
exports.DocumentsController = DocumentsController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: 15, ttl: 60_000 } }),
    (0, common_1.Post)(),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.memoryStorage)(),
        limits: { fileSize: HARD_UPLOAD_CEILING_BYTES },
    })),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], DocumentsController.prototype, "upload", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(status_token_guard_1.StatusTokenGuard),
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, status_token_decorator_1.StatusToken)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], DocumentsController.prototype, "get", null);
exports.DocumentsController = DocumentsController = __decorate([
    (0, common_1.Controller)('documents'),
    __metadata("design:paramtypes", [documents_service_1.DocumentsService])
], DocumentsController);
//# sourceMappingURL=documents.controller.js.map