"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAgentCredential = verifyAgentCredential;
const secret_util_1 = require("./secret.util");
async function verifyAgentCredential(prisma, raw) {
    if (!raw)
        return null;
    const [agentId, secret] = raw.split('.');
    if (!agentId || !secret)
        return null;
    const printer = await prisma.printer.findUnique({ where: { agentId } });
    if (!printer || !(0, secret_util_1.verifySecret)(secret, printer.agentKeyHash))
        return null;
    return printer;
}
//# sourceMappingURL=agent-credential.util.js.map