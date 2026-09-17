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
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let NotificationsService = class NotificationsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async record(shopId, printJobId, eventType) {
        return this.prisma.notification.create({
            data: {
                shopId,
                printJobId: printJobId ?? undefined,
                eventType,
                channel: client_1.NotificationChannel.IN_APP,
                status: 'SENT',
            },
        });
    }
    async listForShop(shopId, page = 1, pageSize = 50) {
        const take = Math.min(pageSize, 200);
        const skip = (Math.max(page, 1) - 1) * take;
        const [items, total] = await Promise.all([
            this.prisma.notification.findMany({
                where: { shopId },
                orderBy: { createdAt: 'desc' },
                take,
                skip,
            }),
            this.prisma.notification.count({ where: { shopId } }),
        ]);
        return { items, total, page, pageSize: take };
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map