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
var PrintersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrintersService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const nanoid_1 = require("nanoid");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const app_exceptions_1 = require("../common/exceptions/app.exceptions");
const secret_util_1 = require("../common/utils/secret.util");
const agent_connection_registry_service_1 = require("../agent-connection/agent-connection-registry.service");
const agentIdAlphabet = (0, nanoid_1.customAlphabet)('abcdefghijklmnopqrstuvwxyz0123456789', 20);
const HEARTBEAT_STALE_MS = 90_000;
let PrintersService = PrintersService_1 = class PrintersService {
    constructor(prisma, connections) {
        this.prisma = prisma;
        this.connections = connections;
        this.logger = new common_1.Logger(PrintersService_1.name);
    }
    async register(dto) {
        const agentId = agentIdAlphabet();
        const agentSecret = (0, secret_util_1.generateAgentSecret)();
        const printer = await this.prisma.printer.create({
            data: {
                shopId: dto.shopId,
                agentId,
                agentKeyHash: (0, secret_util_1.hashSecret)(agentSecret),
                printerName: dto.printerName,
                driverName: dto.driverName,
                status: client_1.PrinterStatus.UNKNOWN,
            },
        });
        return {
            printerId: printer.id,
            agentId: printer.agentId,
            agentSecret,
            agentCredential: `${printer.agentId}.${agentSecret}`,
        };
    }
    async heartbeat(printerId, capabilities) {
        await this.prisma.printer.update({
            where: { id: printerId },
            data: {
                status: client_1.PrinterStatus.ONLINE,
                lastHeartbeatAt: new Date(),
                ...(capabilities ? { capabilitiesJson: capabilities } : {}),
            },
        });
    }
    async markOffline(printerId) {
        await this.prisma.printer.update({
            where: { id: printerId },
            data: { status: client_1.PrinterStatus.OFFLINE },
        });
    }
    async listForShop(shopId) {
        return this.prisma.printer.findMany({ where: { shopId }, orderBy: { createdAt: 'asc' } });
    }
    async listAll() {
        return this.prisma.printer.findMany({ orderBy: { createdAt: 'desc' } });
    }
    async setDefaultForShop(shopId, printerId) {
        const printer = await this.prisma.printer.findUnique({ where: { id: printerId } });
        if (!printer || printer.shopId !== shopId) {
            throw new app_exceptions_1.AppNotFoundException('Printer not found for this shop.');
        }
        return this.prisma.printSettings.upsert({
            where: { shopId },
            update: { defaultPrinterId: printerId },
            create: { shopId, defaultPrinterId: printerId },
        });
    }
    async sweepStaleHeartbeats() {
        const staleBefore = new Date(Date.now() - HEARTBEAT_STALE_MS);
        const result = await this.prisma.printer.updateMany({
            where: {
                status: client_1.PrinterStatus.ONLINE,
                OR: [{ lastHeartbeatAt: { lt: staleBefore } }, { lastHeartbeatAt: null }],
            },
            data: { status: client_1.PrinterStatus.OFFLINE },
        });
        if (result.count > 0) {
            this.logger.warn(`Marked ${result.count} printer(s) OFFLINE due to stale heartbeat.`);
        }
    }
};
exports.PrintersService = PrintersService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_30_SECONDS),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PrintersService.prototype, "sweepStaleHeartbeats", null);
exports.PrintersService = PrintersService = PrintersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        agent_connection_registry_service_1.AgentConnectionRegistry])
], PrintersService);
//# sourceMappingURL=printers.service.js.map