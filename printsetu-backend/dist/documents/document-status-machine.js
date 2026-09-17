"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DOCUMENT_ALLOWED_TRANSITIONS = void 0;
exports.canTransitionDocument = canTransitionDocument;
exports.DOCUMENT_ALLOWED_TRANSITIONS = {
    UPLOADED: ['PROCESSING'],
    PROCESSING: ['PROCESSED', 'ANALYSIS_FAILED'],
    ANALYSIS_FAILED: ['PROCESSING'],
    PROCESSED: [],
    PRINT_ELIGIBLE: [],
    DELETED: [],
};
function canTransitionDocument(from, to) {
    return exports.DOCUMENT_ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
//# sourceMappingURL=document-status-machine.js.map