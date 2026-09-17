"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentsRepository = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const app_exceptions_1 = require("../common/exceptions/app.exceptions");
const document_status_machine_1 = require("./document-status-machine");
let DocumentsRepository = class DocumentsRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async transition(opts) {
        if (!(0, document_status_machine_1.canTransitionDocument)(opts.from, opts.to)) {
            throw new Error(`Illegal document transition ${opts.from} -> ${opts.to}. Allowed: ${document_status_machine_1.DOCUMENT_ALLOWED_TRANSITIONS[opts.from]?.join(', ')}`);
        }
        const result = await this.prisma.document.updateMany({
            where: { id: opts.documentId, status: opts.from },
            data: { status: opts.to, ...opts.data },
        });
        if (result.count === 0) {
            throw new app_exceptions_1.DocumentProcessingConflictException(`Document is not in ${opts.from} state (concurrent update or duplicate attempt).`);
        }
        return this.prisma.document.findUniqueOrThrow({ where: { id: opts.documentId } });
    }
};
exports.DocumentsRepository = DocumentsRepository;
exports.DocumentsRepository = DocumentsRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DocumentsRepository);
//# sourceMappingURL=documents.repository.js.map