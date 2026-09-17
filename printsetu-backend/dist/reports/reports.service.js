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
exports.ReportsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let ReportsService = class ReportsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async printHistory(shopId, page = 1, pageSize = 50) {
        const take = Math.min(pageSize, 200);
        const skip = (Math.max(page, 1) - 1) * take;
        const where = shopId ? { shopId } : {};
        const [items, total] = await Promise.all([
            this.prisma.printJob.findMany({
                where,
                include: { document: true, shop: true, printer: true },
                orderBy: { createdAt: 'desc' },
                take,
                skip,
            }),
            this.prisma.printJob.count({ where }),
        ]);
        return { items, total, page, pageSize: take };
    }
    async failedJobs(page = 1, pageSize = 50) {
        const take = Math.min(pageSize, 200);
        const skip = (Math.max(page, 1) - 1) * take;
        const where = { status: { in: [client_1.PrintJobStatus.PRINT_FAILED, client_1.PrintJobStatus.PRINT_UNKNOWN, client_1.PrintJobStatus.AGENT_OFFLINE] } };
        const [items, total] = await Promise.all([
            this.prisma.printJob.findMany({
                where,
                include: { document: true, shop: true },
                orderBy: { updatedAt: 'desc' },
                take,
                skip,
            }),
            this.prisma.printJob.count({ where }),
        ]);
        return { items, total, page, pageSize: take };
    }
    async summary() {
        const [totalShops, activeShops, totalJobs, printedJobs, failedJobs, pendingJobs, totalDocuments] = await Promise.all([
            this.prisma.shop.count(),
            this.prisma.shop.count({ where: { status: client_1.ShopStatus.ACTIVE } }),
            this.prisma.printJob.count(),
            this.prisma.printJob.count({ where: { status: { in: [client_1.PrintJobStatus.PRINTED, client_1.PrintJobStatus.RETENTION_PENDING, client_1.PrintJobStatus.DELETED] } } }),
            this.prisma.printJob.count({ where: { status: { in: [client_1.PrintJobStatus.PRINT_FAILED, client_1.PrintJobStatus.PRINT_UNKNOWN] } } }),
            this.prisma.printJob.count({ where: { status: { in: [client_1.PrintJobStatus.PRINT_ELIGIBLE, client_1.PrintJobStatus.QUEUED, client_1.PrintJobStatus.PRINTING, client_1.PrintJobStatus.AGENT_OFFLINE] } } }),
            this.prisma.document.count(),
        ]);
        const revenueAgg = await this.prisma.printJob.aggregate({
            _sum: { amount: true },
            where: { status: { in: [client_1.PrintJobStatus.PRINTED, client_1.PrintJobStatus.RETENTION_PENDING, client_1.PrintJobStatus.DELETED] } },
        });
        return {
            totalShops,
            activeShops,
            totalJobs,
            printedJobs,
            failedJobs,
            pendingJobs,
            totalDocuments,
            totalRevenue: (revenueAgg._sum.amount ?? 0).toString(),
        };
    }
};
exports.ReportsService = ReportsService;
exports.ReportsService = ReportsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ReportsService);
//# sourceMappingURL=reports.service.js.map