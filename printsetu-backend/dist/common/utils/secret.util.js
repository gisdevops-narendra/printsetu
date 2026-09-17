"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAgentSecret = generateAgentSecret;
exports.hashSecret = hashSecret;
exports.verifySecret = verifySecret;
const crypto_1 = require("crypto");
function generateAgentSecret() {
    return (0, crypto_1.randomBytes)(32).toString('base64url');
}
function hashSecret(secret) {
    const salt = (0, crypto_1.randomBytes)(16);
    const hash = (0, crypto_1.scryptSync)(secret, salt, 64);
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
}
function verifySecret(secret, stored) {
    const [saltHex, hashHex] = stored.split(':');
    if (!saltHex || !hashHex)
        return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = (0, crypto_1.scryptSync)(secret, salt, 64);
    return actual.length === expected.length && (0, crypto_1.timingSafeEqual)(actual, expected);
}
//# sourceMappingURL=secret.util.js.map