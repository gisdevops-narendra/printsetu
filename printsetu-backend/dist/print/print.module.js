"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrintModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const print_quote_service_1 = require("./print-quote.service");
const print_quote_controller_1 = require("./print-quote.controller");
const print_jobs_service_1 = require("./print-jobs.service");
const print_jobs_repository_1 = require("./print-jobs.repository");
const print_jobs_controller_1 = require("./print-jobs.controller");
const print_jobs_processor_1 = require("./print-jobs.processor");
const print_queue_constants_1 = require("./print-queue.constants");
const pricing_module_1 = require("../pricing/pricing.module");
const storage_module_1 = require("../storage/storage.module");
let PrintModule = class PrintModule {
};
exports.PrintModule = PrintModule;
exports.PrintModule = PrintModule = __decorate([
    (0, common_1.Module)({
        imports: [bullmq_1.BullModule.registerQueue({ name: print_queue_constants_1.PRINT_DISPATCH_QUEUE }), pricing_module_1.PricingModule, storage_module_1.StorageModule],
        controllers: [print_quote_controller_1.PrintQuoteController, print_jobs_controller_1.PrintJobsController, print_jobs_controller_1.ShopPrintJobsController],
        providers: [print_quote_service_1.PrintQuoteService, print_jobs_service_1.PrintJobsService, print_jobs_repository_1.PrintJobsRepository, print_jobs_processor_1.PrintJobsProcessor],
        exports: [print_jobs_service_1.PrintJobsService],
    })
], PrintModule);
//# sourceMappingURL=print.module.js.map