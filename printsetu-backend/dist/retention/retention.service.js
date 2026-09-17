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
var RetentionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetentionService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const schedule_1 = require("@nestjs/schedule");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const storage_interface_1 = require("../storage/storage.interface");
const print_jobs_repository_1 = require("../print/print-jobs.repository");
const system_settings_service_1 = require("../system-settings/system-settings.service");
const system_settings_constants_1 = require("../system-settings/system-settings.constants");
let RetentionService = RetentionService_1 = class RetentionService {
    constructor(prisma, storage, printJobsRepo, config, systemSettings) {
        this.prisma = prisma;
        this.storage = storage;
        this.printJobsRepo = printJobsRepo;
        this.config = config;
        this.systemSettings = systemSettings;
        this.logger = new common_1.Logger(RetentionService_1.name);
    }
    async sweep() {
        const candidates = await this.prisma.printJob.findMany({
            where: { status: client_1.PrintJobStatus.RETENTION_PENDING },
            include: { document: true, shop: { include: { printSettings: true } } },
        });
        const envDefaultMinutes = this.config.get('retention', { infer: true }).defaultMinutes;
        const defaultMinutes = await this.systemSettings.getOrDefault(system_settings_constants_1.DEFAULT_RETENTION_MINUTES_KEY, envDefaultMinutes);
        let deletedCount = 0;
        for (const job of candidates) {
            if (!job.printedAt)
                continue;
            const retentionMinutes = job.shop.printSettings?.retentionMinutes ?? defaultMinutes;
            const eligibleAt = new Date(job.printedAt.getTime() + retentionMinutes * 60_000);
            if (eligibleAt.getTime() > Date.now())
                continue;
            if (job.document.status === client_1.DocumentStatus.DELETED)
                continue;
            try {
                await this.storage.deleteObject(job.document.s3Key);
            }
            catch (error) {
                this.logger.error(`Failed to delete object ${job.document.s3Key}: ${error.message}`);
                continue;
            }
            await this.prisma.document.update({
                where: { id: job.documentId },
                data: { status: client_1.DocumentStatus.DELETED, deletedAt: new Date() },
            });
            await this.printJobsRepo.transition({
                jobId: job.id,
                from: client_1.PrintJobStatus.RETENTION_PENDING,
                to: client_1.PrintJobStatus.DELETED,
                message: `Retention window (${retentionMinutes}m) elapsed.`,
            });
            deletedCount += 1;
        }
        if (deletedCount > 0) {
            this.logger.log(`Retention sweep deleted ${deletedCount} document object(s).`);
        }
    }
    async flagStalePrinting() {
        const staleBefore = new Date(Date.now() - STALE_PRINTING_MS);
        const stale = await this.prisma.printJob.findMany({
            where: { status: client_1.PrintJobStatus.PRINTING, updatedAt: { lt: staleBefore } },
        });
        for (const job of stale) {
            await this.printJobsRepo.transition({
                jobId: job.id,
                from: client_1.PrintJobStatus.PRINTING,
                to: client_1.PrintJobStatus.PRINT_UNKNOWN,
                message: 'No agent update received within the expected window.',
            });
        }
        if (stale.length > 0) {
            this.logger.warn(`Flagged ${stale.length} stale PRINTING job(s) as PRINT_UNKNOWN.`);
        }
    }
};
exports.RetentionService = RetentionService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_MINUTE),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RetentionService.prototype, "sweep", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_MINUTE),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RetentionService.prototype, "flagStalePrinting", null);
exports.RetentionService = RetentionService = RetentionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(storage_interface_1.STORAGE_SERVICE)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object, print_jobs_repository_1.PrintJobsRepository,
        config_1.ConfigService,
        system_settings_service_1.SystemSettingsService])
], RetentionService);
const STALE_PRINTING_MS = 3 * 60_000;
//# sourceMappingURL=retention.service.js.map