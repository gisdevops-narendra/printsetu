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
exports.StatusTokenGuard = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const signed_token_util_1 = require("../utils/signed-token.util");
const app_exceptions_1 = require("../exceptions/app.exceptions");
let StatusTokenGuard = class StatusTokenGuard {
    constructor(config) {
        this.config = config;
    }
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const token = request.headers['x-status-token'] ||
            request.query?.token ||
            (request.body && request.body.statusToken);
        if (!token || typeof token !== 'string') {
            throw new app_exceptions_1.UnauthenticatedException('Missing status token.');
        }
        try {
            const secret = this.config.get('security', { infer: true }).statusTokenSecret;
            request.statusToken = (0, signed_token_util_1.verifyToken)(token, secret);
            return true;
        }
        catch {
            throw new app_exceptions_1.UnauthenticatedException('Invalid or expired status token.');
        }
    }
};
exports.StatusTokenGuard = StatusTokenGuard;
exports.StatusTokenGuard = StatusTokenGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], StatusTokenGuard);
//# sourceMappingURL=status-token.guard.js.map