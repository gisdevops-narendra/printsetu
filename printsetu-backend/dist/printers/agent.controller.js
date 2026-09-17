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
exports.AgentController = void 0;
const common_1 = require("@nestjs/common");
const printers_service_1 = require("./printers.service");
const print_jobs_service_1 = require("../print/print-jobs.service");
const printer_dto_1 = require("./dto/printer.dto");
const print_dto_1 = require("../print/dto/print.dto");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const public_decorator_1 = require("../common/decorators/public.decorator");
const agent_auth_guard_1 = require("../common/guards/agent-auth.guard");
const current_agent_decorator_1 = require("../common/decorators/current-agent.decorator");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const storage_interface_1 = require("../storage/storage.interface");
let AgentController = class AgentController {
    constructor(printersService, printJobsService, prisma, storage) {
        this.printersService = printersService;
        this.printJobsService = printJobsService;
        this.prisma = prisma;
        this.storage = storage;
    }
    register(dto) {
        return this.printersService.register(dto);
    }
    async nextJob(agent) {
        const job = await this.prisma.printJob.findFirst({
            where: {
                printerId: agent.printerId,
                status: { in: [client_1.PrintJobStatus.QUEUED, client_1.PrintJobStatus.AGENT_OFFLINE] },
            },
            include: { document: true },
            orderBy: { queuedAt: 'asc' },
        });
        if (!job)
            return { job: null };
        const documentSignedUrl = await this.storage.getSignedDownloadUrl(job.document.s3Key);
        return {
            job: {
                jobId: job.id,
                originalName: job.document.originalName,
                mimeType: job.document.mimeType,
                options: job.optionsJson,
                attemptId: `${job.id}:${job.attemptCount}`,
                documentSignedUrl,
            },
        };
    }
    reportStatus(id, dto, agent) {
        return this.printJobsService.reportAgentStatus(id, agent.printerId, dto);
    }
    heartbeat(agent) {
        return this.printersService.heartbeat(agent.printerId);
    }
};
exports.AgentController = AgentController;
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN'),
    (0, common_1.Post)('register'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [printer_dto_1.RegisterPrinterDto]),
    __metadata("design:returntype", void 0)
], AgentController.prototype, "register", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(agent_auth_guard_1.AgentAuthGuard),
    (0, common_1.Get)('jobs/next'),
    __param(0, (0, current_agent_decorator_1.CurrentAgent)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "nextJob", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(agent_auth_guard_1.AgentAuthGuard),
    (0, common_1.Post)('jobs/:id/status'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_agent_decorator_1.CurrentAgent)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, print_dto_1.AgentJobStatusDto, Object]),
    __metadata("design:returntype", void 0)
], AgentController.prototype, "reportStatus", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(agent_auth_guard_1.AgentAuthGuard),
    (0, common_1.Post)('heartbeat'),
    __param(0, (0, current_agent_decorator_1.CurrentAgent)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AgentController.prototype, "heartbeat", null);
exports.AgentController = AgentController = __decorate([
    (0, common_1.Controller)('agent'),
    __param(3, (0, common_1.Inject)(storage_interface_1.STORAGE_SERVICE)),
    __metadata("design:paramtypes", [printers_service_1.PrintersService,
        print_jobs_service_1.PrintJobsService,
        prisma_service_1.PrismaService, Object])
], AgentController);
//# sourceMappingURL=agent.controller.js.map