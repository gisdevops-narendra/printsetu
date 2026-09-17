"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const bullmq_1 = require("@nestjs/bullmq");
const schedule_1 = require("@nestjs/schedule");
const configuration_1 = __importDefault(require("./config/configuration"));
const prisma_module_1 = require("./prisma/prisma.module");
const audit_module_1 = require("./audit/audit.module");
const notifications_module_1 = require("./notifications/notifications.module");
const agent_connection_module_1 = require("./agent-connection/agent-connection.module");
const auth_module_1 = require("./auth/auth.module");
const users_module_1 = require("./users/users.module");
const shops_module_1 = require("./shops/shops.module");
const pricing_module_1 = require("./pricing/pricing.module");
const qr_module_1 = require("./qr/qr.module");
const documents_module_1 = require("./documents/documents.module");
const print_module_1 = require("./print/print.module");
const printers_module_1 = require("./printers/printers.module");
const retention_module_1 = require("./retention/retention.module");
const reports_module_1 = require("./reports/reports.module");
const system_settings_module_1 = require("./system-settings/system-settings.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true, load: [configuration_1.default] }),
            schedule_1.ScheduleModule.forRoot(),
            throttler_1.ThrottlerModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => {
                    const security = config.get('security', { infer: true });
                    return [{ ttl: security.rateLimitTtlSeconds * 1000, limit: security.rateLimitMax }];
                },
            }),
            bullmq_1.BullModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    connection: {
                        host: config.get('redis', { infer: true }).host,
                        port: config.get('redis', { infer: true }).port,
                    },
                }),
            }),
            prisma_module_1.PrismaModule,
            audit_module_1.AuditModule,
            notifications_module_1.NotificationsModule,
            agent_connection_module_1.AgentConnectionModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            shops_module_1.ShopsModule,
            pricing_module_1.PricingModule,
            qr_module_1.QrModule,
            documents_module_1.DocumentsModule,
            print_module_1.PrintModule,
            printers_module_1.PrintersModule,
            retention_module_1.RetentionModule,
            reports_module_1.ReportsModule,
            system_settings_module_1.SystemSettingsModule,
        ],
        providers: [{ provide: core_1.APP_GUARD, useClass: throttler_1.ThrottlerGuard }],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map