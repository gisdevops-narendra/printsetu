"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrentAgent = void 0;
const common_1 = require("@nestjs/common");
exports.CurrentAgent = (0, common_1.createParamDecorator)((_data, ctx) => {
    const request = ctx.switchToHttp().getRequest();
    return request.agent;
});
//# sourceMappingURL=current-agent.decorator.js.map