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
exports.KeycloakAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const public_decorator_1 = require("../decorators/public.decorator");
const app_exceptions_1 = require("../exceptions/app.exceptions");
const keycloak_token_verifier_service_1 = require("../../auth/keycloak-token-verifier.service");
const users_service_1 = require("../../users/users.service");
let KeycloakAuthGuard = class KeycloakAuthGuard {
    constructor(reflector, verifier, usersService) {
        this.reflector = reflector;
        this.verifier = verifier;
        this.usersService = usersService;
    }
    async canActivate(context) {
        const isPublic = this.reflector.getAllAndOverride(public_decorator_1.IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic)
            return true;
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new app_exceptions_1.UnauthenticatedException();
        }
        const token = authHeader.substring('Bearer '.length);
        try {
            const claims = await this.verifier.verify(token);
            request.user = await this.usersService.resolveFromKeycloakClaims(claims);
            return true;
        }
        catch {
            throw new app_exceptions_1.UnauthenticatedException();
        }
    }
};
exports.KeycloakAuthGuard = KeycloakAuthGuard;
exports.KeycloakAuthGuard = KeycloakAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        keycloak_token_verifier_service_1.KeycloakTokenVerifierService,
        users_service_1.UsersService])
], KeycloakAuthGuard);
//# sourceMappingURL=keycloak-auth.guard.js.map