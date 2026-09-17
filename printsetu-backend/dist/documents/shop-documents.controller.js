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
exports.ShopDocumentsController = void 0;
const common_1 = require("@nestjs/common");
const documents_service_1 = require("./documents.service");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const app_exceptions_1 = require("../common/exceptions/app.exceptions");
let ShopDocumentsController = class ShopDocumentsController {
    constructor(documentsService) {
        this.documentsService = documentsService;
    }
    async previewUrl(id, user) {
        if (!user.shopId)
            throw new app_exceptions_1.ShopAccessDeniedException('No shop assigned to this account.');
        return this.documentsService.getPreviewUrlForShop(id, user.shopId);
    }
};
exports.ShopDocumentsController = ShopDocumentsController;
__decorate([
    (0, common_1.Get)(':id/preview-url'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ShopDocumentsController.prototype, "previewUrl", null);
exports.ShopDocumentsController = ShopDocumentsController = __decorate([
    (0, common_1.Controller)('shop/documents'),
    (0, roles_decorator_1.Roles)('SHOPKEEPER'),
    __metadata("design:paramtypes", [documents_service_1.DocumentsService])
], ShopDocumentsController);
//# sourceMappingURL=shop-documents.controller.js.map