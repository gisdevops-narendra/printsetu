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
exports.SetPricingDto = void 0;
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class SetPricingDto {
}
exports.SetPricingDto = SetPricingDto;
__decorate([
    (0, class_validator_1.IsEnum)(client_1.PaperSize),
    __metadata("design:type", String)
], SetPricingDto.prototype, "paperSize", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(client_1.ColorMode),
    __metadata("design:type", String)
], SetPricingDto.prototype, "colorMode", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(client_1.SideMode),
    __metadata("design:type", String)
], SetPricingDto.prototype, "sideMode", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsPositive)(),
    __metadata("design:type", Number)
], SetPricingDto.prototype, "pricePerPage", void 0);
//# sourceMappingURL=pricing.dto.js.map