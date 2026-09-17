"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusToken = void 0;
const common_1 = require("@nestjs/common");
exports.StatusToken = (0, common_1.createParamDecorator)((_data, ctx) => {
    const request = ctx.switchToHttp().getRequest();
    return request.statusToken;
});
//# sourceMappingURL=status-token.decorator.js.map