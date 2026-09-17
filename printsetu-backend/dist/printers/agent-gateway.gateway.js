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
var AgentGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentGateway = void 0;
const common_1 = require("@nestjs/common");
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const prisma_service_1 = require("../prisma/prisma.service");
const agent_credential_util_1 = require("../common/utils/agent-credential.util");
const agent_connection_registry_service_1 = require("../agent-connection/agent-connection-registry.service");
const printers_service_1 = require("./printers.service");
const print_jobs_service_1 = require("../print/print-jobs.service");
let AgentGateway = AgentGateway_1 = class AgentGateway {
    constructor(prisma, connections, printersService, printJobsService) {
        this.prisma = prisma;
        this.connections = connections;
        this.printersService = printersService;
        this.printJobsService = printJobsService;
        this.logger = new common_1.Logger(AgentGateway_1.name);
    }
    async handleConnection(socket) {
        const token = socket.handshake.auth?.token;
        const printer = await (0, agent_credential_util_1.verifyAgentCredential)(this.prisma, token);
        if (!printer) {
            this.logger.warn(`Rejected unauthenticated agent socket ${socket.id}`);
            socket.emit('error', { code: 'UNAUTHENTICATED', message: 'Invalid agent credential.' });
            socket.disconnect(true);
            return;
        }
        socket.data.printerId = printer.id;
        this.connections.register(printer.id, socket);
        await this.printersService.heartbeat(printer.id);
    }
    async handleDisconnect(socket) {
        const printerId = socket.data?.printerId;
        if (printerId) {
            this.connections.unregister(printerId);
            await this.printersService.markOffline(printerId);
        }
    }
    async onHeartbeat(socket) {
        const printerId = socket.data?.printerId;
        if (printerId)
            await this.printersService.heartbeat(printerId);
    }
    async onJobStatus(socket, payload) {
        const printerId = socket.data?.printerId;
        if (!printerId)
            return;
        try {
            await this.printJobsService.reportAgentStatus(payload.jobId, printerId, {
                status: payload.status,
                agentAttemptId: payload.agentAttemptId,
                message: payload.message,
            });
        }
        catch (error) {
            this.logger.warn(`job:status handling failed: ${error.message}`);
        }
    }
};
exports.AgentGateway = AgentGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], AgentGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('heartbeat'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], AgentGateway.prototype, "onHeartbeat", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('job:status'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], AgentGateway.prototype, "onJobStatus", null);
exports.AgentGateway = AgentGateway = AgentGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ namespace: '/agent', cors: { origin: '*' } }),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        agent_connection_registry_service_1.AgentConnectionRegistry,
        printers_service_1.PrintersService,
        print_jobs_service_1.PrintJobsService])
], AgentGateway);
//# sourceMappingURL=agent-gateway.gateway.js.map