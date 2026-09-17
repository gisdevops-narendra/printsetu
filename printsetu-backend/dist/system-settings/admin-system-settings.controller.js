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
exports.AdminSystemSettingsController = void 0;
const common_1 = require("@nestjs/common");
const system_settings_service_1 = require("./system-settings.service");
const system_setting_dto_1 = require("./dto/system-setting.dto");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const audit_service_1 = require("../audit/audit.service");
const app_exceptions_1 = require("../common/exceptions/app.exceptions");
let AdminSystemSettingsController = class AdminSystemSettingsController {
    constructor(settings, audit) {
        this.settings = settings;
        this.audit = audit;
    }
    list() {
        return this.settings.list();
    }
    async get(key) {
        const value = await this.settings.get(key);
        if (value === null)
            throw new app_exceptions_1.AppNotFoundException(`No setting stored for "${key}".`);
        return { key, value };
    }
    async set(key, dto, user, req) {
        const updated = await this.settings.set(key, dto.value);
        await this.audit.log({
            actorUserId: user.id,
            action: 'SYSTEM_SETTING_UPDATED',
            entityType: 'system_setting',
            entityId: key,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: { key, value: dto.value },
        });
        return updated;
    }
};
exports.AdminSystemSettingsController = AdminSystemSettingsController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminSystemSettingsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':key'),
    __param(0, (0, common_1.Param)('key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminSystemSettingsController.prototype, "get", null);
__decorate([
    (0, common_1.Put)(':key'),
    __param(0, (0, common_1.Param)('key')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, system_setting_dto_1.UpdateSystemSettingDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminSystemSettingsController.prototype, "set", null);
exports.AdminSystemSettingsController = AdminSystemSettingsController = __decorate([
    (0, common_1.Controller)('admin/settings'),
    (0, roles_decorator_1.Roles)('ADMIN'),
    __metadata("design:paramtypes", [system_settings_service_1.SystemSettingsService,
        audit_service_1.AuditService])
], AdminSystemSettingsController);
//# sourceMappingURL=admin-system-settings.controller.js.map