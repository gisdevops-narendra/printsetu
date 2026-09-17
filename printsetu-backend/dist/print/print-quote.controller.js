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
exports.PrintQuoteController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const print_quote_service_1 = require("./print-quote.service");
const print_dto_1 = require("./dto/print.dto");
const public_decorator_1 = require("../common/decorators/public.decorator");
const status_token_guard_1 = require("../common/guards/status-token.guard");
const status_token_decorator_1 = require("../common/decorators/status-token.decorator");
let PrintQuoteController = class PrintQuoteController {
    constructor(quoteService) {
        this.quoteService = quoteService;
    }
    create(dto, claims) {
        return this.quoteService.createQuote(dto, claims);
    }
};
exports.PrintQuoteController = PrintQuoteController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(status_token_guard_1.StatusTokenGuard),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60_000 } }),
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, status_token_decorator_1.StatusToken)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [print_dto_1.CreateQuoteDto, Object]),
    __metadata("design:returntype", void 0)
], PrintQuoteController.prototype, "create", null);
exports.PrintQuoteController = PrintQuoteController = __decorate([
    (0, common_1.Controller)('print/quote'),
    __metadata("design:paramtypes", [print_quote_service_1.PrintQuoteService])
], PrintQuoteController);
//# sourceMappingURL=print-quote.controller.js.map