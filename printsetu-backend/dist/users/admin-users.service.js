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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminUsersService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const keycloak_admin_service_1 = require("../auth/keycloak-admin.service");
const app_exceptions_1 = require("../common/exceptions/app.exceptions");
const client_1 = require("@prisma/client");
let AdminUsersService = class AdminUsersService {
    constructor(prisma, keycloakAdmin) {
        this.prisma = prisma;
        this.keycloakAdmin = keycloakAdmin;
    }
    async list(shopId) {
        return this.prisma.user.findMany({
            where: shopId ? { shopId } : {},
            include: { role: true, shop: true },
            orderBy: { createdAt: 'desc' },
        });
    }
    async create(dto) {
        if (dto.role === client_1.RoleName.SHOPKEEPER && !dto.shopId) {
            throw new app_exceptions_1.InvalidPrintOptionException('SHOPKEEPER users must be assigned to a shop.');
        }
        const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
        if (!role)
            throw new app_exceptions_1.AppNotFoundException(`Role ${dto.role} is not seeded.`);
        const temporaryPassword = (0, crypto_1.randomBytes)(9).toString('base64url');
        const keycloakUserId = await this.keycloakAdmin.provisionUser({
            email: dto.email,
            firstName: dto.name.split(' ')[0] || dto.name,
            lastName: dto.name.split(' ').slice(1).join(' ') || '-',
            role: dto.role,
            temporaryPassword,
        });
        const user = await this.prisma.user.create({
            data: {
                shopId: dto.shopId ?? null,
                roleId: role.id,
                name: dto.name,
                email: dto.email,
                mobile: dto.mobile,
                keycloakUserId,
                status: client_1.UserStatus.ACTIVE,
            },
        });
        return { ...user, temporaryPassword };
    }
    async setStatus(id, status) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user)
            throw new app_exceptions_1.AppNotFoundException('User not found.');
        if (user.keycloakUserId) {
            if (status === client_1.UserStatus.DISABLED)
                await this.keycloakAdmin.disableUser(user.keycloakUserId);
            else
                await this.keycloakAdmin.enableUser(user.keycloakUserId);
        }
        return this.prisma.user.update({ where: { id }, data: { status } });
    }
};
exports.AdminUsersService = AdminUsersService;
exports.AdminUsersService = AdminUsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        keycloak_admin_service_1.KeycloakAdminService])
], AdminUsersService);
//# sourceMappingURL=admin-users.service.js.map