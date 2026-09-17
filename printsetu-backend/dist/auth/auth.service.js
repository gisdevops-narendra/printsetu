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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const app_exceptions_1 = require("../common/exceptions/app.exceptions");
let AuthService = AuthService_1 = class AuthService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(AuthService_1.name);
    }
    async login(username, password) {
        const kc = this.config.get('keycloak', { infer: true });
        try {
            const { data } = await axios_1.default.post(kc.tokenUrl, new URLSearchParams({
                grant_type: 'password',
                client_id: kc.frontendClientId,
                username,
                password,
                scope: 'openid',
            }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
            return this.toTokenResponse(data);
        }
        catch (error) {
            this.logger.warn(`Login failed for ${username}: ${error.message}`);
            throw new app_exceptions_1.UnauthenticatedException('Invalid username or password.');
        }
    }
    async refresh(refreshToken) {
        const kc = this.config.get('keycloak', { infer: true });
        try {
            const { data } = await axios_1.default.post(kc.tokenUrl, new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: kc.frontendClientId,
                refresh_token: refreshToken,
            }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
            return this.toTokenResponse(data);
        }
        catch (error) {
            this.logger.warn(`Refresh failed: ${error.message}`);
            throw new app_exceptions_1.UnauthenticatedException('Invalid or expired refresh token.');
        }
    }
    toTokenResponse(data) {
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            tokenType: data.token_type,
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AuthService);
//# sourceMappingURL=auth.service.js.map