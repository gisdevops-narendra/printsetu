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
exports.AdminReportsController = void 0;
const common_1 = require("@nestjs/common");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const reports_service_1 = require("./reports.service");
let AdminReportsController = class AdminReportsController {
    constructor(reportsService) {
        this.reportsService = reportsService;
    }
    summary() {
        return this.reportsService.summary();
    }
    printHistory(shopId, page = '1', pageSize = '50') {
        return this.reportsService.printHistory(shopId, parseInt(page, 10), parseInt(pageSize, 10));
    }
    failedJobs(page = '1', pageSize = '50') {
        return this.reportsService.failedJobs(parseInt(page, 10), parseInt(pageSize, 10));
    }
};
exports.AdminReportsController = AdminReportsController;
__decorate([
    (0, common_1.Get)('reports/summary'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminReportsController.prototype, "summary", null);
__decorate([
    (0, common_1.Get)('print-history'),
    __param(0, (0, common_1.Query)('shopId')),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminReportsController.prototype, "printHistory", null);
__decorate([
    (0, common_1.Get)('print-jobs/failed'),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminReportsController.prototype, "failedJobs", null);
exports.AdminReportsController = AdminReportsController = __decorate([
    (0, common_1.Controller)('admin'),
    (0, roles_decorator_1.Roles)('ADMIN'),
    __metadata("design:paramtypes", [reports_service_1.ReportsService])
], AdminReportsController);
//# sourceMappingURL=admin-reports.controller.js.map