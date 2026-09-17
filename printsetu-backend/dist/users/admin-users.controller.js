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
exports.AdminUsersController = void 0;
const common_1 = require("@nestjs/common");
const admin_users_service_1 = require("./admin-users.service");
const admin_user_dto_1 = require("./dto/admin-user.dto");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const audit_service_1 = require("../audit/audit.service");
let AdminUsersController = class AdminUsersController {
    constructor(adminUsersService, audit) {
        this.adminUsersService = adminUsersService;
        this.audit = audit;
    }
    list(shopId) {
        return this.adminUsersService.list(shopId);
    }
    async create(dto, actor, req) {
        const user = await this.adminUsersService.create(dto);
        await this.audit.log({
            actorUserId: actor.id,
            shopId: dto.shopId,
            action: 'USER_CREATED',
            entityType: 'user',
            entityId: user.id,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: { role: dto.role, email: dto.email },
        });
        return user;
    }
    async setStatus(id, dto, actor, req) {
        const user = await this.adminUsersService.setStatus(id, dto.status);
        await this.audit.log({
            actorUserId: actor.id,
            action: dto.status === 'ACTIVE' ? 'USER_ENABLED' : 'USER_DISABLED',
            entityType: 'user',
            entityId: id,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
        });
        return user;
    }
};
exports.AdminUsersController = AdminUsersController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('shopId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminUsersController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_user_dto_1.CreateUserDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminUsersController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, admin_user_dto_1.UpdateUserStatusDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminUsersController.prototype, "setStatus", null);
exports.AdminUsersController = AdminUsersController = __decorate([
    (0, common_1.Controller)('admin/users'),
    (0, roles_decorator_1.Roles)('ADMIN'),
    __metadata("design:paramtypes", [admin_users_service_1.AdminUsersService,
        audit_service_1.AuditService])
], AdminUsersController);
//# sourceMappingURL=admin-users.controller.js.map