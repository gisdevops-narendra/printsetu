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
exports.PricingService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const app_exceptions_1 = require("../common/exceptions/app.exceptions");
let PricingService = class PricingService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    listActiveForShop(shopId) {
        return this.prisma.pricing.findMany({
            where: { shopId, active: true },
            orderBy: [{ paperSize: 'asc' }, { colorMode: 'asc' }, { sideMode: 'asc' }],
        });
    }
    listHistoryForShop(shopId) {
        return this.prisma.pricing.findMany({
            where: { shopId },
            orderBy: { effectiveFrom: 'desc' },
        });
    }
    async setRate(shopId, dto) {
        return this.prisma.$transaction(async (tx) => {
            await tx.pricing.updateMany({
                where: {
                    shopId,
                    paperSize: dto.paperSize,
                    colorMode: dto.colorMode,
                    sideMode: dto.sideMode,
                    active: true,
                },
                data: { active: false },
            });
            return tx.pricing.create({
                data: {
                    shopId,
                    paperSize: dto.paperSize,
                    colorMode: dto.colorMode,
                    sideMode: dto.sideMode,
                    pricePerPage: dto.pricePerPage,
                    active: true,
                },
            });
        });
    }
    async getActiveRateOrThrow(shopId, paperSize, colorMode, sideMode) {
        const rate = await this.prisma.pricing.findFirst({
            where: { shopId, paperSize, colorMode, sideMode, active: true },
        });
        if (!rate) {
            throw new app_exceptions_1.InvalidPrintOptionException(`No active pricing configured for ${paperSize}/${colorMode}/${sideMode} at this shop.`);
        }
        return rate;
    }
};
exports.PricingService = PricingService;
exports.PricingService = PricingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PricingService);
//# sourceMappingURL=pricing.service.js.map