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
exports.ShopsService = void 0;
const common_1 = require("@nestjs/common");
const nanoid_1 = require("nanoid");
const prisma_service_1 = require("../prisma/prisma.service");
const app_exceptions_1 = require("../common/exceptions/app.exceptions");
const client_1 = require("@prisma/client");
const shopCodeAlphabet = (0, nanoid_1.customAlphabet)('0123456789ABCDEFGHJKLMNPQRSTUVWXYZ', 8);
let ShopsService = class ShopsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(dto) {
        const shop = await this.prisma.shop.create({
            data: {
                shopCode: `SHOP-${shopCodeAlphabet()}`,
                name: dto.name,
                ownerName: dto.ownerName,
                mobile: dto.mobile,
                email: dto.email,
                address: dto.address,
                city: dto.city,
                status: client_1.ShopStatus.ACTIVE,
                printSettings: { create: {} },
            },
            include: { printSettings: true },
        });
        return shop;
    }
    async list(page = 1, pageSize = 50) {
        const take = Math.min(pageSize, 200);
        const skip = (Math.max(page, 1) - 1) * take;
        const [items, total] = await Promise.all([
            this.prisma.shop.findMany({ orderBy: { createdAt: 'desc' }, take, skip }),
            this.prisma.shop.count(),
        ]);
        return { items, total, page, pageSize: take };
    }
    async findByIdOrThrow(id) {
        const shop = await this.prisma.shop.findUnique({ where: { id } });
        if (!shop)
            throw new app_exceptions_1.AppNotFoundException('Shop not found.');
        return shop;
    }
    async update(id, dto) {
        await this.findByIdOrThrow(id);
        return this.prisma.shop.update({ where: { id }, data: dto });
    }
    async setStatus(id, status) {
        await this.findByIdOrThrow(id);
        return this.prisma.shop.update({ where: { id }, data: { status } });
    }
    async getSettings(shopId) {
        await this.findByIdOrThrow(shopId);
        return this.prisma.printSettings.upsert({
            where: { shopId },
            update: {},
            create: { shopId },
        });
    }
    async updateSettings(shopId, dto) {
        await this.findByIdOrThrow(shopId);
        return this.prisma.printSettings.upsert({
            where: { shopId },
            update: dto,
            create: { shopId, ...dto },
        });
    }
};
exports.ShopsService = ShopsService;
exports.ShopsService = ShopsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ShopsService);
//# sourceMappingURL=shops.service.js.map