"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrintersModule = void 0;
const common_1 = require("@nestjs/common");
const printers_service_1 = require("./printers.service");
const agent_controller_1 = require("./agent.controller");
const admin_printers_controller_1 = require("./admin-printers.controller");
const agent_gateway_gateway_1 = require("./agent-gateway.gateway");
const storage_module_1 = require("../storage/storage.module");
const print_module_1 = require("../print/print.module");
let PrintersModule = class PrintersModule {
};
exports.PrintersModule = PrintersModule;
exports.PrintersModule = PrintersModule = __decorate([
    (0, common_1.Module)({
        imports: [storage_module_1.StorageModule, print_module_1.PrintModule],
        controllers: [agent_controller_1.AgentController, admin_printers_controller_1.AdminPrintersController],
        providers: [printers_service_1.PrintersService, agent_gateway_gateway_1.AgentGateway],
        exports: [printers_service_1.PrintersService],
    })
], PrintersModule);
//# sourceMappingURL=printers.module.js.map