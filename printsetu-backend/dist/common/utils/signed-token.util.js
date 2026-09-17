"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signToken = signToken;
exports.verifyToken = verifyToken;
const crypto_1 = require("crypto");
function base64url(input) {
    return Buffer.from(input).toString('base64url');
}
function signToken(payload, secret) {
    const body = base64url(JSON.stringify(payload));
    const signature = base64url((0, crypto_1.createHmac)('sha256', secret).update(body).digest());
    return `${body}.${signature}`;
}
function verifyToken(token, secret) {
    const [body, signature] = token.split('.');
    if (!body || !signature) {
        throw new Error('Malformed token');
    }
    const expectedSignature = base64url((0, crypto_1.createHmac)('sha256', secret).update(body).digest());
    const a = Buffer.from(signature);
    const b = Buffer.from(expectedSignature);
    if (a.length !== b.length || !(0, crypto_1.timingSafeEqual)(a, b)) {
        throw new Error('Invalid token signature');
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('Token expired');
    }
    return payload;
}
//# sourceMappingURL=signed-token.util.js.map