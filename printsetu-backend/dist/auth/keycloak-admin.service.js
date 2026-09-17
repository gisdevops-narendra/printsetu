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
var KeycloakAdminService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeycloakAdminService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
let KeycloakAdminService = KeycloakAdminService_1 = class KeycloakAdminService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(KeycloakAdminService_1.name);
        this.cachedToken = null;
    }
    async getServiceToken() {
        if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 5_000) {
            return this.cachedToken.token;
        }
        const kc = this.config.get('keycloak', { infer: true });
        const { data } = await axios_1.default.post(kc.tokenUrl, new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: kc.backendAdminClientId,
            client_secret: kc.backendAdminClientSecret,
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        this.cachedToken = {
            token: data.access_token,
            expiresAt: Date.now() + data.expires_in * 1000,
        };
        return this.cachedToken.token;
    }
    async authHeaders() {
        const token = await this.getServiceToken();
        return { Authorization: `Bearer ${token}` };
    }
    async provisionUser(params) {
        const kc = this.config.get('keycloak', { infer: true });
        const headers = await this.authHeaders();
        const createResponse = await axios_1.default.post(`${kc.adminApiBaseUrl}/users`, {
            username: params.email,
            email: params.email,
            firstName: params.firstName,
            lastName: params.lastName,
            enabled: true,
            emailVerified: true,
        }, { headers, validateStatus: (s) => s === 201 || s === 409 });
        let keycloakUserId;
        if (createResponse.status === 409) {
            const existing = await axios_1.default.get(`${kc.adminApiBaseUrl}/users`, {
                headers,
                params: { username: params.email, exact: true },
            });
            keycloakUserId = existing.data[0]?.id;
        }
        else {
            const location = createResponse.headers.location;
            keycloakUserId = location.substring(location.lastIndexOf('/') + 1);
        }
        await axios_1.default.put(`${kc.adminApiBaseUrl}/users/${keycloakUserId}/reset-password`, { type: 'password', value: params.temporaryPassword, temporary: true }, { headers });
        const roleResponse = await axios_1.default.get(`${kc.adminApiBaseUrl}/roles/${params.role}`, { headers });
        await axios_1.default.post(`${kc.adminApiBaseUrl}/users/${keycloakUserId}/role-mappings/realm`, [{ id: roleResponse.data.id, name: roleResponse.data.name }], { headers });
        return keycloakUserId;
    }
    async disableUser(keycloakUserId) {
        const kc = this.config.get('keycloak', { infer: true });
        const headers = await this.authHeaders();
        await axios_1.default.put(`${kc.adminApiBaseUrl}/users/${keycloakUserId}`, { enabled: false }, { headers });
    }
    async enableUser(keycloakUserId) {
        const kc = this.config.get('keycloak', { infer: true });
        const headers = await this.authHeaders();
        await axios_1.default.put(`${kc.adminApiBaseUrl}/users/${keycloakUserId}`, { enabled: true }, { headers });
    }
};
exports.KeycloakAdminService = KeycloakAdminService;
exports.KeycloakAdminService = KeycloakAdminService = KeycloakAdminService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], KeycloakAdminService);
//# sourceMappingURL=keycloak-admin.service.js.map