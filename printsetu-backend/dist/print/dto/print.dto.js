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
exports.ReconcileJobDto = exports.AgentJobStatusDto = exports.ConfirmPrintJobDto = exports.CreateQuoteDto = void 0;
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class CreateQuoteDto {
}
exports.CreateQuoteDto = CreateQuoteDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateQuoteDto.prototype, "documentId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(client_1.PaperSize),
    __metadata("design:type", String)
], CreateQuoteDto.prototype, "paperSize", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(client_1.ColorMode),
    __metadata("design:type", String)
], CreateQuoteDto.prototype, "colorMode", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(client_1.SideMode),
    __metadata("design:type", String)
], CreateQuoteDto.prototype, "sideMode", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(999),
    __metadata("design:type", Number)
], CreateQuoteDto.prototype, "copies", void 0);
class ConfirmPrintJobDto {
}
exports.ConfirmPrintJobDto = ConfirmPrintJobDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ConfirmPrintJobDto.prototype, "quoteId", void 0);
class AgentJobStatusDto {
}
exports.AgentJobStatusDto = AgentJobStatusDto;
__decorate([
    (0, class_validator_1.IsEnum)(['ACCEPTED', 'PRINTING', 'PRINTED', 'PRINT_FAILED', 'PRINT_UNKNOWN']),
    __metadata("design:type", String)
], AgentJobStatusDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], AgentJobStatusDto.prototype, "agentAttemptId", void 0);
class ReconcileJobDto {
}
exports.ReconcileJobDto = ReconcileJobDto;
__decorate([
    (0, class_validator_1.IsEnum)(['PRINTED', 'PRINT_FAILED']),
    __metadata("design:type", String)
], ReconcileJobDto.prototype, "outcome", void 0);
//# sourceMappingURL=print.dto.js.map