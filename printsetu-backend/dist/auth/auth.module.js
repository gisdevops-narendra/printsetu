"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const auth_controller_1 = require("./auth.controller");
const auth_service_1 = require("./auth.service");
const keycloak_token_verifier_service_1 = require("./keycloak-token-verifier.service");
const users_module_1 = require("../users/users.module");
const keycloak_auth_guard_1 = require("../common/guards/keycloak-auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [users_module_1.UsersModule],
        controllers: [auth_controller_1.AuthController],
        providers: [
            auth_service_1.AuthService,
            keycloak_token_verifier_service_1.KeycloakTokenVerifierService,
            { provide: core_1.APP_GUARD, useClass: keycloak_auth_guard_1.KeycloakAuthGuard },
            { provide: core_1.APP_GUARD, useClass: roles_guard_1.RolesGuard },
        ],
        exports: [keycloak_token_verifier_service_1.KeycloakTokenVerifierService],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map