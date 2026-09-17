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
exports.ShopPrintJobsController = exports.PrintJobsController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const print_jobs_service_1 = require("./print-jobs.service");
const print_dto_1 = require("./dto/print.dto");
const public_decorator_1 = require("../common/decorators/public.decorator");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const status_token_guard_1 = require("../common/guards/status-token.guard");
const status_token_decorator_1 = require("../common/decorators/status-token.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const app_exceptions_1 = require("../common/exceptions/app.exceptions");
let PrintJobsController = class PrintJobsController {
    constructor(printJobsService) {
        this.printJobsService = printJobsService;
    }
    confirm(dto, claims) {
        return this.printJobsService.confirmFromQuote(dto, claims);
    }
    status(id, claims) {
        return this.printJobsService.getStatusForCustomer(id, claims);
    }
};
exports.PrintJobsController = PrintJobsController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(status_token_guard_1.StatusTokenGuard),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60_000 } }),
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, status_token_decorator_1.StatusToken)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [print_dto_1.ConfirmPrintJobDto, Object]),
    __metadata("design:returntype", void 0)
], PrintJobsController.prototype, "confirm", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(status_token_guard_1.StatusTokenGuard),
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, status_token_decorator_1.StatusToken)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PrintJobsController.prototype, "status", null);
exports.PrintJobsController = PrintJobsController = __decorate([
    (0, common_1.Controller)('print-jobs'),
    __metadata("design:paramtypes", [print_jobs_service_1.PrintJobsService])
], PrintJobsController);
let ShopPrintJobsController = class ShopPrintJobsController {
    constructor(printJobsService) {
        this.printJobsService = printJobsService;
    }
    requireShop(user) {
        if (!user.shopId)
            throw new app_exceptions_1.ShopAccessDeniedException('No shop assigned to this account.');
        return user.shopId;
    }
    queue(user) {
        return this.printJobsService.shopQueue(this.requireShop(user));
    }
    history(user, page = '1', pageSize = '50') {
        return this.printJobsService.shopHistory(this.requireShop(user), parseInt(page, 10), parseInt(pageSize, 10));
    }
    print(id, user) {
        return this.printJobsService.triggerPrint(id, this.requireShop(user));
    }
    reconcile(id, dto, user) {
        return this.printJobsService.reconcile(id, this.requireShop(user), dto);
    }
};
exports.ShopPrintJobsController = ShopPrintJobsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ShopPrintJobsController.prototype, "queue", null);
__decorate([
    (0, common_1.Get)('history'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ShopPrintJobsController.prototype, "history", null);
__decorate([
    (0, common_1.Post)(':id/print'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ShopPrintJobsController.prototype, "print", null);
__decorate([
    (0, common_1.Post)(':id/reconcile'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, print_dto_1.ReconcileJobDto, Object]),
    __metadata("design:returntype", void 0)
], ShopPrintJobsController.prototype, "reconcile", null);
exports.ShopPrintJobsController = ShopPrintJobsController = __decorate([
    (0, common_1.Controller)('shop/print-jobs'),
    (0, roles_decorator_1.Roles)('SHOPKEEPER'),
    __metadata("design:paramtypes", [print_jobs_service_1.PrintJobsService])
], ShopPrintJobsController);
//# sourceMappingURL=print-jobs.controller.js.map