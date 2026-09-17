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
exports.AgentAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const agent_credential_util_1 = require("../utils/agent-credential.util");
const app_exceptions_1 = require("../exceptions/app.exceptions");
let AgentAuthGuard = class AgentAuthGuard {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new app_exceptions_1.UnauthenticatedException('Missing agent credential.');
        }
        const raw = authHeader.substring('Bearer '.length);
        const printer = await (0, agent_credential_util_1.verifyAgentCredential)(this.prisma, raw);
        if (!printer) {
            throw new app_exceptions_1.UnauthenticatedException('Invalid agent credential.');
        }
        const agent = {
            printerId: printer.id,
            agentId: printer.agentId,
            shopId: printer.shopId,
        };
        request.agent = agent;
        return true;
    }
};
exports.AgentAuthGuard = AgentAuthGuard;
exports.AgentAuthGuard = AgentAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AgentAuthGuard);
//# sourceMappingURL=agent-auth.guard.js.map