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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const app_exceptions_1 = require("../common/exceptions/app.exceptions");
let UsersService = class UsersService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async resolveFromKeycloakClaims(claims) {
        let user = await this.prisma.user.findUnique({
            where: { keycloakUserId: claims.sub },
            include: { role: true },
        });
        if (!user) {
            user = await this.prisma.user.findUnique({
                where: { email: claims.email },
                include: { role: true },
            });
            if (user) {
                user = await this.prisma.user.update({
                    where: { id: user.id },
                    data: { keycloakUserId: claims.sub, lastLoginAt: new Date() },
                    include: { role: true },
                });
            }
        }
        else {
            await this.prisma.user.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date() },
            });
        }
        if (!user || user.status !== 'ACTIVE') {
            throw new app_exceptions_1.UnauthenticatedException('No active PrintSetu account for this login.');
        }
        return {
            id: user.id,
            keycloakUserId: user.keycloakUserId,
            email: user.email,
            name: user.name,
            role: user.role.name,
            shopId: user.shopId,
        };
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map