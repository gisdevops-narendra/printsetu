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
exports.AdminShopsController = void 0;
const common_1 = require("@nestjs/common");
const shops_service_1 = require("./shops.service");
const shop_dto_1 = require("./dto/shop.dto");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const audit_service_1 = require("../audit/audit.service");
let AdminShopsController = class AdminShopsController {
    constructor(shopsService, audit) {
        this.shopsService = shopsService;
        this.audit = audit;
    }
    async create(dto, user, req) {
        const shop = await this.shopsService.create(dto);
        await this.audit.log({
            actorUserId: user.id,
            shopId: shop.id,
            action: 'SHOP_CREATED',
            entityType: 'shop',
            entityId: shop.id,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: { name: shop.name, shopCode: shop.shopCode },
        });
        return shop;
    }
    list(page = '1', pageSize = '50') {
        return this.shopsService.list(parseInt(page, 10), parseInt(pageSize, 10));
    }
    get(id) {
        return this.shopsService.findByIdOrThrow(id);
    }
    async update(id, dto, user, req) {
        const shop = await this.shopsService.update(id, dto);
        await this.audit.log({
            actorUserId: user.id,
            shopId: id,
            action: 'SHOP_UPDATED',
            entityType: 'shop',
            entityId: id,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: { ...dto },
        });
        return shop;
    }
    async setStatus(id, dto, user, req) {
        const shop = await this.shopsService.setStatus(id, dto.status);
        await this.audit.log({
            actorUserId: user.id,
            shopId: id,
            action: dto.status === 'ACTIVE' ? 'SHOP_ACTIVATED' : 'SHOP_DEACTIVATED',
            entityType: 'shop',
            entityId: id,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
        });
        return shop;
    }
    getSettings(id) {
        return this.shopsService.getSettings(id);
    }
    async updateSettings(id, dto, user, req) {
        const settings = await this.shopsService.updateSettings(id, dto);
        await this.audit.log({
            actorUserId: user.id,
            shopId: id,
            action: 'SHOP_SETTINGS_UPDATED',
            entityType: 'print_settings',
            entityId: settings.id,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: { ...dto },
        });
        return settings;
    }
};
exports.AdminShopsController = AdminShopsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [shop_dto_1.CreateShopDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminShopsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminShopsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminShopsController.prototype, "get", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, shop_dto_1.UpdateShopDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminShopsController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, shop_dto_1.UpdateShopStatusDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminShopsController.prototype, "setStatus", null);
__decorate([
    (0, common_1.Get)(':id/settings'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminShopsController.prototype, "getSettings", null);
__decorate([
    (0, common_1.Patch)(':id/settings'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, shop_dto_1.UpdatePrintSettingsDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminShopsController.prototype, "updateSettings", null);
exports.AdminShopsController = AdminShopsController = __decorate([
    (0, common_1.Controller)('admin/shops'),
    (0, roles_decorator_1.Roles)('ADMIN'),
    __metadata("design:paramtypes", [shops_service_1.ShopsService,
        audit_service_1.AuditService])
], AdminShopsController);
//# sourceMappingURL=admin-shops.controller.js.map