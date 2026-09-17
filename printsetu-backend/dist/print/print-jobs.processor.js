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
var PrintJobsProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrintJobsProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const print_jobs_service_1 = require("./print-jobs.service");
const print_queue_constants_1 = require("./print-queue.constants");
let PrintJobsProcessor = PrintJobsProcessor_1 = class PrintJobsProcessor extends bullmq_1.WorkerHost {
    constructor(printJobsService) {
        super();
        this.printJobsService = printJobsService;
        this.logger = new common_1.Logger(PrintJobsProcessor_1.name);
    }
    async process(job) {
        this.logger.log(`Dispatch attempt ${job.attemptsMade + 1} for print job ${job.data.printJobId}`);
        await this.printJobsService.dispatchToAgent(job.data.printJobId);
    }
};
exports.PrintJobsProcessor = PrintJobsProcessor;
exports.PrintJobsProcessor = PrintJobsProcessor = PrintJobsProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(print_queue_constants_1.PRINT_DISPATCH_QUEUE),
    __metadata("design:paramtypes", [print_jobs_service_1.PrintJobsService])
], PrintJobsProcessor);
//# sourceMappingURL=print-jobs.processor.js.map