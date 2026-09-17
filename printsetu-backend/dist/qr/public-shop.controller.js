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
exports.PublicShopController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const public_decorator_1 = require("../common/decorators/public.decorator");
const qr_service_1 = require("./qr.service");
let PublicShopController = class PublicShopController {
    constructor(qrService) {
        this.qrService = qrService;
    }
    async resolve(publicCode) {
        const { shopName, city } = await this.qrService.resolvePublicCode(publicCode);
        return { shopCode: publicCode, shopName, city };
    }
};
exports.PublicShopController = PublicShopController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60_000 } }),
    (0, common_1.Get)(':publicCode'),
    __param(0, (0, common_1.Param)('publicCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PublicShopController.prototype, "resolve", null);
exports.PublicShopController = PublicShopController = __decorate([
    (0, common_1.Controller)('public/shops'),
    __metadata("design:paramtypes", [qr_service_1.QrService])
], PublicShopController);
//# sourceMappingURL=public-shop.controller.js.map