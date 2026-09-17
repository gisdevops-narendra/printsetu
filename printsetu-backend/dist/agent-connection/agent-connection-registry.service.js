"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AgentConnectionRegistry_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentConnectionRegistry = void 0;
const common_1 = require("@nestjs/common");
let AgentConnectionRegistry = AgentConnectionRegistry_1 = class AgentConnectionRegistry {
    constructor() {
        this.logger = new common_1.Logger(AgentConnectionRegistry_1.name);
        this.sockets = new Map();
    }
    register(printerId, socket) {
        this.sockets.set(printerId, socket);
        this.logger.log(`Agent connected for printer ${printerId}`);
    }
    unregister(printerId) {
        this.sockets.delete(printerId);
        this.logger.log(`Agent disconnected for printer ${printerId}`);
    }
    isConnected(printerId) {
        return this.sockets.has(printerId);
    }
    pushJob(printerId, payload) {
        const socket = this.sockets.get(printerId);
        if (!socket)
            return false;
        socket.emit('job:assigned', payload);
        return true;
    }
};
exports.AgentConnectionRegistry = AgentConnectionRegistry;
exports.AgentConnectionRegistry = AgentConnectionRegistry = AgentConnectionRegistry_1 = __decorate([
    (0, common_1.Injectable)()
], AgentConnectionRegistry);
//# sourceMappingURL=agent-connection-registry.service.js.map