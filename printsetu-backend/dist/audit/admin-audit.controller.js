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
exports.AdminAuditController = void 0;
const common_1 = require("@nestjs/common");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const prisma_service_1 = require("../prisma/prisma.service");
let AdminAuditController = class AdminAuditController {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list(shopId, entityType, page = '1', pageSize = '50') {
        const take = Math.min(parseInt(pageSize, 10) || 50, 200);
        const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;
        const where = {
            ...(shopId ? { shopId } : {}),
            ...(entityType ? { entityType } : {}),
        };
        const [items, total] = await Promise.all([
            this.prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take,
                skip,
            }),
            this.prisma.auditLog.count({ where }),
        ]);
        return { items, total, page: Number(page), pageSize: take };
    }
};
exports.AdminAuditController = AdminAuditController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('shopId')),
    __param(1, (0, common_1.Query)('entityType')),
    __param(2, (0, common_1.Query)('page')),
    __param(3, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminAuditController.prototype, "list", null);
exports.AdminAuditController = AdminAuditController = __decorate([
    (0, common_1.Controller)('admin/audit-logs'),
    (0, roles_decorator_1.Roles)('ADMIN'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AdminAuditController);
//# sourceMappingURL=admin-audit.controller.js.map