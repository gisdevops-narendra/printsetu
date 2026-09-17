"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_TRANSITIONS = void 0;
exports.canTransition = canTransition;
exports.ALLOWED_TRANSITIONS = {
    CREATED: ['PRINT_ELIGIBLE', 'CANCELLED'],
    PRINT_ELIGIBLE: ['QUEUED', 'CANCELLED'],
    QUEUED: ['PRINTING', 'AGENT_OFFLINE', 'PRINT_FAILED'],
    PRINTING: ['PRINTED', 'PRINT_FAILED', 'PRINT_UNKNOWN'],
    PRINT_UNKNOWN: ['PRINTED', 'PRINT_FAILED'],
    AGENT_OFFLINE: ['QUEUED', 'PRINT_FAILED'],
    PRINT_FAILED: ['QUEUED'],
    PRINTED: ['RETENTION_PENDING'],
    RETENTION_PENDING: ['DELETED'],
    DELETED: [],
    CANCELLED: [],
};
function canTransition(from, to) {
    return exports.ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
//# sourceMappingURL=print-job-state-machine.js.map