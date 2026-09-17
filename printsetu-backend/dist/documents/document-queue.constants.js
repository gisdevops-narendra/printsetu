"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DOCUMENT_ANALYSIS_JOB_OPTS = exports.DOCUMENT_ANALYSIS_QUEUE = void 0;
exports.DOCUMENT_ANALYSIS_QUEUE = 'document-analysis';
exports.DOCUMENT_ANALYSIS_JOB_OPTS = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: true,
    removeOnFail: false,
};
//# sourceMappingURL=document-queue.constants.js.map