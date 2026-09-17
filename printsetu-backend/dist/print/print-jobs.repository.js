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
exports.PrintJobsRepository = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const app_exceptions_1 = require("../common/exceptions/app.exceptions");
const print_job_state_machine_1 = require("./print-job-state-machine");
let PrintJobsRepository = class PrintJobsRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async transition(opts) {
        if (!(0, print_job_state_machine_1.canTransition)(opts.from, opts.to)) {
            throw new Error(`Illegal print job transition ${opts.from} -> ${opts.to}. Allowed: ${print_job_state_machine_1.ALLOWED_TRANSITIONS[opts.from]?.join(', ')}`);
        }
        return this.prisma.$transaction(async (tx) => {
            const result = await tx.printJob.updateMany({
                where: { id: opts.jobId, status: opts.from },
                data: { status: opts.to, ...opts.data },
            });
            if (result.count === 0) {
                throw new app_exceptions_1.JobAlreadyPrintingException(`Job is not in ${opts.from} state (concurrent update or duplicate action).`);
            }
            await tx.printJobEvent.create({
                data: {
                    printJobId: opts.jobId,
                    status: opts.to,
                    agentAttemptId: opts.agentAttemptId,
                    message: opts.message,
                },
            });
            return tx.printJob.findUniqueOrThrow({ where: { id: opts.jobId } });
        });
    }
};
exports.PrintJobsRepository = PrintJobsRepository;
exports.PrintJobsRepository = PrintJobsRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PrintJobsRepository);
//# sourceMappingURL=print-jobs.repository.js.map