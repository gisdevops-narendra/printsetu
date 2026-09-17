"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QrService = void 0;
const common_1 = require("@nestjs/common");
const nanoid_1 = require("nanoid");
const QRCode = __importStar(require("qrcode"));
const prisma_service_1 = require("../prisma/prisma.service");
const app_exceptions_1 = require("../common/exceptions/app.exceptions");
const client_1 = require("@prisma/client");
const publicCodeAlphabet = (0, nanoid_1.customAlphabet)('abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', 16);
let QrService = class QrService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    publicAppBaseUrl() {
        return process.env.PUBLIC_APP_BASE_URL || 'http://localhost:4200';
    }
    async getOrCreateActiveForShop(shopId) {
        const existing = await this.prisma.qrCode.findFirst({
            where: { shopId, status: client_1.QrStatus.ACTIVE },
            orderBy: { generatedAt: 'desc' },
        });
        if (existing)
            return existing;
        return this.createNew(shopId);
    }
    async regenerate(shopId) {
        await this.prisma.qrCode.updateMany({
            where: { shopId, status: client_1.QrStatus.ACTIVE },
            data: { status: client_1.QrStatus.REVOKED, revokedAt: new Date() },
        });
        return this.createNew(shopId);
    }
    async createNew(shopId) {
        const publicCode = publicCodeAlphabet();
        return this.prisma.qrCode.create({
            data: {
                shopId,
                publicCode,
                targetPath: `/s/${publicCode}`,
                status: client_1.QrStatus.ACTIVE,
            },
        });
    }
    async renderPngDataUrl(shopId) {
        const qr = await this.getOrCreateActiveForShop(shopId);
        const url = `${this.publicAppBaseUrl()}${qr.targetPath}`;
        const dataUrl = await QRCode.toDataURL(url, { margin: 2, width: 480 });
        return { dataUrl, url, code: qr.publicCode };
    }
    async resolvePublicCode(publicCode) {
        const qr = await this.prisma.qrCode.findUnique({
            where: { publicCode },
            include: { shop: true },
        });
        if (!qr || qr.status !== client_1.QrStatus.ACTIVE) {
            throw new app_exceptions_1.AppNotFoundException('This QR code is not active.');
        }
        if (qr.shop.status !== 'ACTIVE') {
            throw new app_exceptions_1.AppNotFoundException('This shop is not currently accepting print requests.');
        }
        return {
            shopId: qr.shop.id,
            shopName: qr.shop.name,
            city: qr.shop.city,
        };
    }
};
exports.QrService = QrService;
exports.QrService = QrService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], QrService);
//# sourceMappingURL=qr.service.js.map