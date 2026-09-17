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
exports.ShopNotificationsController = void 0;
const common_1 = require("@nestjs/common");
const notifications_service_1 = require("./notifications.service");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const app_exceptions_1 = require("../common/exceptions/app.exceptions");
let ShopNotificationsController = class ShopNotificationsController {
    constructor(notifications) {
        this.notifications = notifications;
    }
    list(user, page = '1', pageSize = '50') {
        if (!user.shopId)
            throw new app_exceptions_1.ShopAccessDeniedException('No shop assigned to this account.');
        return this.notifications.listForShop(user.shopId, parseInt(page, 10), parseInt(pageSize, 10));
    }
};
exports.ShopNotificationsController = ShopNotificationsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ShopNotificationsController.prototype, "list", null);
exports.ShopNotificationsController = ShopNotificationsController = __decorate([
    (0, common_1.Controller)('shop/notifications'),
    (0, roles_decorator_1.Roles)('SHOPKEEPER'),
    __metadata("design:paramtypes", [notifications_service_1.NotificationsService])
], ShopNotificationsController);
//# sourceMappingURL=shop-notifications.controller.js.map