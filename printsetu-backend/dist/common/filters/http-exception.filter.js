"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
const common_1 = require("@nestjs/common");
const STATUS_CODE_FALLBACK = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHENTICATED',
    403: 'SHOP_ACCESS_DENIED',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    413: 'FILE_TOO_LARGE',
    422: 'UNSUPPORTED_DOCUMENT',
    429: 'RATE_LIMITED',
    503: 'PRINT_AGENT_OFFLINE',
};
let AllExceptionsFilter = class AllExceptionsFilter {
    constructor() {
        this.logger = new common_1.Logger('ExceptionFilter');
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        let status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let code = 'INTERNAL_ERROR';
        let message = 'Unexpected server error.';
        if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
            const body = exception.getResponse();
            if (typeof body === 'object' && body !== null) {
                const asAny = body;
                code = asAny.code || STATUS_CODE_FALLBACK[status] || 'ERROR';
                message = Array.isArray(asAny.message)
                    ? asAny.message.join(', ')
                    : asAny.message || exception.message;
            }
            else {
                code = STATUS_CODE_FALLBACK[status] || 'ERROR';
                message = String(body);
            }
        }
        else if (exception instanceof Error) {
            this.logger.error(exception.message, exception.stack);
        }
        response.status(status).json({
            statusCode: status,
            code,
            message,
            path: request.url,
            timestamp: new Date().toISOString(),
        });
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = __decorate([
    (0, common_1.Catch)()
], AllExceptionsFilter);
//# sourceMappingURL=http-exception.filter.js.map