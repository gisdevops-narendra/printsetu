"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetentionModule = void 0;
const common_1 = require("@nestjs/common");
const retention_service_1 = require("./retention.service");
const storage_module_1 = require("../storage/storage.module");
const print_jobs_repository_1 = require("../print/print-jobs.repository");
const system_settings_module_1 = require("../system-settings/system-settings.module");
let RetentionModule = class RetentionModule {
};
exports.RetentionModule = RetentionModule;
exports.RetentionModule = RetentionModule = __decorate([
    (0, common_1.Module)({
        imports: [storage_module_1.StorageModule, system_settings_module_1.SystemSettingsModule],
        providers: [retention_service_1.RetentionService, print_jobs_repository_1.PrintJobsRepository],
    })
], RetentionModule);
//# sourceMappingURL=retention.module.js.map