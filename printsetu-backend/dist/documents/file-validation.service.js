"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileValidationService = void 0;
const common_1 = require("@nestjs/common");
const app_exceptions_1 = require("../common/exceptions/app.exceptions");
const SIGNATURES = [
    { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
    { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
    { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];
let FileValidationService = class FileValidationService {
    async assertSafeAndSupported(buffer) {
        if (!buffer || buffer.length === 0) {
            throw new app_exceptions_1.UnsupportedDocumentException('Uploaded file is empty.');
        }
        const match = SIGNATURES.find((sig) => {
            const offset = sig.offset ?? 0;
            if (buffer.length < offset + sig.bytes.length)
                return false;
            return sig.bytes.every((byte, i) => buffer[offset + i] === byte);
        });
        if (!match) {
            throw new app_exceptions_1.UnsupportedDocumentException('Only PDF, JPG and PNG files are supported in this release.');
        }
        return match.mime;
    }
};
exports.FileValidationService = FileValidationService;
exports.FileValidationService = FileValidationService = __decorate([
    (0, common_1.Injectable)()
], FileValidationService);
//# sourceMappingURL=file-validation.service.js.map