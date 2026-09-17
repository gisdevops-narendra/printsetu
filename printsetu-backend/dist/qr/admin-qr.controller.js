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
exports.AdminQrController = void 0;
const common_1 = require("@nestjs/common");
const qr_service_1 = require("./qr.service");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const audit_service_1 = require("../audit/audit.service");
let AdminQrController = class AdminQrController {
    constructor(qrService, audit) {
        this.qrService = qrService;
        this.audit = audit;
    }
    async getOrCreate(shopId) {
        return this.qrService.renderPngDataUrl(shopId);
    }
    async regenerate(shopId, user, req) {
        await this.qrService.regenerate(shopId);
        await this.audit.log({
            actorUserId: user.id,
            shopId,
            action: 'QR_REGENERATED',
            entityType: 'qr_code',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
        });
        return this.qrService.renderPngDataUrl(shopId);
    }
};
exports.AdminQrController = AdminQrController;
__decorate([
    (0, common_1.Get)(':shopId'),
    __param(0, (0, common_1.Param)('shopId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminQrController.prototype, "getOrCreate", null);
__decorate([
    (0, common_1.Post)(':shopId/regenerate'),
    __param(0, (0, common_1.Param)('shopId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminQrController.prototype, "regenerate", null);
exports.AdminQrController = AdminQrController = __decorate([
    (0, common_1.Controller)('admin/qr'),
    (0, roles_decorator_1.Roles)('ADMIN'),
    __metadata("design:paramtypes", [qr_service_1.QrService,
        audit_service_1.AuditService])
], AdminQrController);
//# sourceMappingURL=admin-qr.controller.js.map