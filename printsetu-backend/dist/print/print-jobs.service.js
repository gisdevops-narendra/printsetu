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
exports.PrintJobsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const client_1 = require("@prisma/client");
const uuid_1 = require("uuid");
const prisma_service_1 = require("../prisma/prisma.service");
const print_jobs_repository_1 = require("./print-jobs.repository");
const storage_interface_1 = require("../storage/storage.interface");
const agent_connection_registry_service_1 = require("../agent-connection/agent-connection-registry.service");
const notifications_service_1 = require("../notifications/notifications.service");
const audit_service_1 = require("../audit/audit.service");
const signed_token_util_1 = require("../common/utils/signed-token.util");
const app_exceptions_1 = require("../common/exceptions/app.exceptions");
const print_queue_constants_1 = require("./print-queue.constants");
const JOB_STATUS_TOKEN_TTL_SECONDS = 48 * 60 * 60;
let PrintJobsService = class PrintJobsService {
    constructor(prisma, repo, storage, agentConnections, notifications, audit, config, dispatchQueue) {
        this.prisma = prisma;
        this.repo = repo;
        this.storage = storage;
        this.agentConnections = agentConnections;
        this.notifications = notifications;
        this.audit = audit;
        this.config = config;
        this.dispatchQueue = dispatchQueue;
    }
    async confirmFromQuote(dto, claims) {
        const quote = await this.prisma.printQuote.findUnique({
            where: { id: dto.quoteId },
            include: { document: true },
        });
        if (!quote)
            throw new app_exceptions_1.AppNotFoundException('Quote not found.');
        if (claims.documentId !== quote.documentId || claims.shopId !== quote.document.shopId) {
            throw new app_exceptions_1.ShopAccessDeniedException('Status token does not grant access to this quote.');
        }
        if (quote.consumedAt) {
            throw new app_exceptions_1.InvalidPrintOptionException('This quote has already been used.');
        }
        if (quote.expiresAt.getTime() < Date.now()) {
            throw new app_exceptions_1.InvalidPrintOptionException('Quote has expired; please recalculate the price.');
        }
        const jobId = (0, uuid_1.v4)();
        const statusToken = (0, signed_token_util_1.signToken)({
            shopId: quote.document.shopId,
            printJobId: jobId,
            exp: Math.floor(Date.now() / 1000) + JOB_STATUS_TOKEN_TTL_SECONDS,
        }, this.config.get('security', { infer: true }).statusTokenSecret);
        const job = await this.prisma.$transaction(async (tx) => {
            const created = await tx.printJob.create({
                data: {
                    id: jobId,
                    shopId: quote.document.shopId,
                    documentId: quote.documentId,
                    quoteId: quote.id,
                    optionsJson: {
                        paperSize: quote.paperSize,
                        colorMode: quote.colorMode,
                        sideMode: quote.sideMode,
                        copies: quote.copies,
                    },
                    amount: quote.amount,
                    currency: quote.currency,
                    status: client_1.PrintJobStatus.CREATED,
                    idempotencyKey: `quote:${quote.id}`,
                    statusToken,
                },
            });
            await tx.printJobEvent.create({ data: { printJobId: created.id, status: client_1.PrintJobStatus.CREATED } });
            await tx.printQuote.update({ where: { id: quote.id }, data: { consumedAt: new Date() } });
            await tx.document.update({
                where: { id: quote.documentId },
                data: { status: client_1.DocumentStatus.PRINT_ELIGIBLE },
            });
            return created;
        });
        const eligible = await this.repo.transition({
            jobId: job.id,
            from: client_1.PrintJobStatus.CREATED,
            to: client_1.PrintJobStatus.PRINT_ELIGIBLE,
        });
        return {
            jobId: eligible.id,
            status: eligible.status,
            statusToken,
            amount: eligible.amount.toFixed(2),
            currency: eligible.currency,
        };
    }
    async shopQueue(shopId) {
        return this.prisma.printJob.findMany({
            where: {
                shopId,
                status: {
                    in: [
                        client_1.PrintJobStatus.PRINT_ELIGIBLE,
                        client_1.PrintJobStatus.QUEUED,
                        client_1.PrintJobStatus.PRINTING,
                        client_1.PrintJobStatus.AGENT_OFFLINE,
                        client_1.PrintJobStatus.PRINT_UNKNOWN,
                    ],
                },
            },
            include: { document: true, printer: true },
            orderBy: { createdAt: 'asc' },
        });
    }
    async shopHistory(shopId, page = 1, pageSize = 50) {
        const take = Math.min(pageSize, 200);
        const skip = (Math.max(page, 1) - 1) * take;
        const [items, total] = await Promise.all([
            this.prisma.printJob.findMany({
                where: { shopId },
                include: { document: true, printer: true },
                orderBy: { createdAt: 'desc' },
                take,
                skip,
            }),
            this.prisma.printJob.count({ where: { shopId } }),
        ]);
        return { items, total, page, pageSize: take };
    }
    async triggerPrint(jobId, shopId) {
        const job = await this.prisma.printJob.findUnique({ where: { id: jobId } });
        if (!job || job.shopId !== shopId)
            throw new app_exceptions_1.AppNotFoundException('Print job not found.');
        const printer = job.printerId
            ? await this.prisma.printer.findUnique({ where: { id: job.printerId } })
            : await this.resolveShopPrinter(shopId);
        if (!printer) {
            throw new app_exceptions_1.PrintAgentOfflineException('No printer is registered for this shop yet.');
        }
        const fromStatus = job.status;
        if (fromStatus !== client_1.PrintJobStatus.PRINT_ELIGIBLE &&
            fromStatus !== client_1.PrintJobStatus.AGENT_OFFLINE &&
            fromStatus !== client_1.PrintJobStatus.PRINT_FAILED) {
            throw new app_exceptions_1.InvalidPrintOptionException(`Job cannot be queued from status ${fromStatus}.`);
        }
        const updated = await this.repo.transition({
            jobId,
            from: fromStatus,
            to: client_1.PrintJobStatus.QUEUED,
            data: {
                printerId: printer.id,
                queuedAt: new Date(),
                attemptCount: { increment: 1 },
            },
        });
        await this.notifications.record(shopId, jobId, 'PRINT_QUEUED');
        await this.dispatchQueue.add('dispatch', { printJobId: jobId }, { attempts: 5, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: true });
        return { jobId: updated.id, status: updated.status, printerId: printer.id, message: 'Print job queued' };
    }
    async resolveShopPrinter(shopId) {
        const settings = await this.prisma.printSettings.findUnique({ where: { shopId } });
        if (settings?.defaultPrinterId) {
            const printer = await this.prisma.printer.findUnique({ where: { id: settings.defaultPrinterId } });
            if (printer)
                return printer;
        }
        return this.prisma.printer.findFirst({ where: { shopId }, orderBy: { createdAt: 'asc' } });
    }
    async dispatchToAgent(jobId) {
        const job = await this.prisma.printJob.findUniqueOrThrow({
            where: { id: jobId },
            include: { document: true },
        });
        if (job.status !== client_1.PrintJobStatus.QUEUED)
            return;
        if (!job.printerId || !this.agentConnections.isConnected(job.printerId)) {
            await this.repo.transition({
                jobId,
                from: client_1.PrintJobStatus.QUEUED,
                to: client_1.PrintJobStatus.AGENT_OFFLINE,
                message: 'No connected agent at dispatch time.',
            });
            throw new Error('AGENT_OFFLINE');
        }
        const signedUrl = await this.storage.getSignedDownloadUrl(job.document.s3Key);
        const options = job.optionsJson;
        this.agentConnections.pushJob(job.printerId, {
            jobId: job.id,
            documentSignedUrl: signedUrl,
            originalName: job.document.originalName,
            mimeType: job.document.mimeType,
            options: {
                paperSize: options.paperSize,
                colorMode: options.colorMode,
                sideMode: options.sideMode,
                copies: options.copies,
            },
            attemptId: `${job.id}:${job.attemptCount}`,
        });
    }
    async reportAgentStatus(jobId, printerId, dto) {
        const job = await this.prisma.printJob.findUnique({ where: { id: jobId } });
        if (!job || job.printerId !== printerId) {
            throw new app_exceptions_1.AppNotFoundException('Print job not found for this agent.');
        }
        const map = {
            ACCEPTED: client_1.PrintJobStatus.PRINTING,
            PRINTING: client_1.PrintJobStatus.PRINTING,
            PRINTED: client_1.PrintJobStatus.PRINTED,
            PRINT_FAILED: client_1.PrintJobStatus.PRINT_FAILED,
            PRINT_UNKNOWN: client_1.PrintJobStatus.PRINT_UNKNOWN,
        };
        const to = map[dto.status];
        if (!to)
            throw new app_exceptions_1.InvalidPrintOptionException('Unrecognized agent status.');
        const from = job.status === to ? null : job.status;
        let updated = job;
        if (from) {
            updated = await this.repo.transition({
                jobId,
                from,
                to,
                agentAttemptId: dto.agentAttemptId,
                message: dto.message,
                data: to === client_1.PrintJobStatus.PRINTED ? { printedAt: new Date() } : {},
            });
        }
        if (to === client_1.PrintJobStatus.PRINTED) {
            await this.notifications.record(job.shopId, jobId, 'PRINT_COMPLETED');
            updated = await this.repo.transition({
                jobId,
                from: client_1.PrintJobStatus.PRINTED,
                to: client_1.PrintJobStatus.RETENTION_PENDING,
            });
        }
        else if (to === client_1.PrintJobStatus.PRINT_FAILED) {
            await this.notifications.record(job.shopId, jobId, 'PRINT_FAILED');
            await this.prisma.printJob.update({ where: { id: jobId }, data: { failureReason: dto.message ?? 'Reported by agent' } });
        }
        return { jobId: updated.id, status: updated.status };
    }
    async reconcile(jobId, shopId, dto) {
        const job = await this.prisma.printJob.findUnique({ where: { id: jobId } });
        if (!job || job.shopId !== shopId)
            throw new app_exceptions_1.AppNotFoundException('Print job not found.');
        if (job.status !== client_1.PrintJobStatus.PRINT_UNKNOWN) {
            throw new app_exceptions_1.InvalidPrintOptionException('Only PRINT_UNKNOWN jobs can be manually reconciled.');
        }
        const to = dto.outcome === 'PRINTED' ? client_1.PrintJobStatus.PRINTED : client_1.PrintJobStatus.PRINT_FAILED;
        const updated = await this.repo.transition({
            jobId,
            from: client_1.PrintJobStatus.PRINT_UNKNOWN,
            to,
            message: dto.message ?? 'Manually reconciled by shopkeeper',
            data: to === client_1.PrintJobStatus.PRINTED ? { printedAt: new Date() } : {},
        });
        await this.audit.log({
            shopId,
            action: 'PRINT_JOB_RECONCILED',
            entityType: 'print_job',
            entityId: jobId,
            metadata: { outcome: dto.outcome },
        });
        return { jobId: updated.id, status: updated.status };
    }
    async getStatusForCustomer(jobId, claims) {
        const job = await this.prisma.printJob.findUnique({
            where: { id: jobId },
            include: { document: true, events: { orderBy: { createdAt: 'asc' } } },
        });
        if (!job)
            throw new app_exceptions_1.AppNotFoundException('Print job not found.');
        if (claims.printJobId !== jobId || claims.shopId !== job.shopId) {
            throw new app_exceptions_1.ShopAccessDeniedException('Status token does not grant access to this job.');
        }
        return job;
    }
};
exports.PrintJobsService = PrintJobsService;
exports.PrintJobsService = PrintJobsService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)(storage_interface_1.STORAGE_SERVICE)),
    __param(7, (0, bullmq_1.InjectQueue)(print_queue_constants_1.PRINT_DISPATCH_QUEUE)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        print_jobs_repository_1.PrintJobsRepository, Object, agent_connection_registry_service_1.AgentConnectionRegistry,
        notifications_service_1.NotificationsService,
        audit_service_1.AuditService,
        config_1.ConfigService,
        bullmq_2.Queue])
], PrintJobsService);
//# sourceMappingURL=print-jobs.service.js.map