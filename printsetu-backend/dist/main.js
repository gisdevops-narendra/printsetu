"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const common_1 = require("@nestjs/common");
const helmet_1 = __importDefault(require("helmet"));
const app_module_1 = require("./app.module");
const http_exception_filter_1 = require("./common/filters/http-exception.filter");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { cors: false });
    const config = app.get((config_1.ConfigService));
    app.use((0, helmet_1.default)());
    app.enableCors({
        origin: config.get('corsAllowedOrigins', { infer: true }),
        credentials: true,
    });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
    }));
    app.useGlobalFilters(new http_exception_filter_1.AllExceptionsFilter());
    const port = config.get('port', { infer: true });
    await app.listen(port, '0.0.0.0');
    console.log(`PrintSetu backend listening on http://0.0.0.0:${port}/api`);
}
bootstrap();
//# sourceMappingURL=main.js.map