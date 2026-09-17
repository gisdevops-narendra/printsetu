"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentProcessingConflictException = exports.PrintAgentOfflineException = exports.UnsupportedDocumentException = exports.FileTooLargeException = exports.JobAlreadyPrintingException = exports.AppNotFoundException = exports.ShopAccessDeniedException = exports.UnauthenticatedException = exports.InvalidPrintOptionException = exports.AppException = void 0;
const common_1 = require("@nestjs/common");
class AppException extends common_1.HttpException {
    constructor(code, message, status) {
        super({ code, message }, status);
        this.code = code;
    }
}
exports.AppException = AppException;
class InvalidPrintOptionException extends AppException {
    constructor(message = 'Unsupported option or invalid quote.') {
        super('INVALID_PRINT_OPTION', message, common_1.HttpStatus.BAD_REQUEST);
    }
}
exports.InvalidPrintOptionException = InvalidPrintOptionException;
class UnauthenticatedException extends AppException {
    constructor(message = 'Missing or invalid authentication.') {
        super('UNAUTHENTICATED', message, common_1.HttpStatus.UNAUTHORIZED);
    }
}
exports.UnauthenticatedException = UnauthenticatedException;
class ShopAccessDeniedException extends AppException {
    constructor(message = 'You do not have access to this shop resource.') {
        super('SHOP_ACCESS_DENIED', message, common_1.HttpStatus.FORBIDDEN);
    }
}
exports.ShopAccessDeniedException = ShopAccessDeniedException;
class AppNotFoundException extends AppException {
    constructor(message = 'Resource does not exist or is inaccessible.') {
        super('NOT_FOUND', message, common_1.HttpStatus.NOT_FOUND);
    }
}
exports.AppNotFoundException = AppNotFoundException;
class JobAlreadyPrintingException extends AppException {
    constructor(message = 'Duplicate print attempt.') {
        super('JOB_ALREADY_PRINTING', message, common_1.HttpStatus.CONFLICT);
    }
}
exports.JobAlreadyPrintingException = JobAlreadyPrintingException;
class FileTooLargeException extends AppException {
    constructor(message = 'Upload exceeds configured limit.') {
        super('FILE_TOO_LARGE', message, common_1.HttpStatus.PAYLOAD_TOO_LARGE);
    }
}
exports.FileTooLargeException = FileTooLargeException;
class UnsupportedDocumentException extends AppException {
    constructor(message = 'File cannot be processed safely.') {
        super('UNSUPPORTED_DOCUMENT', message, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
    }
}
exports.UnsupportedDocumentException = UnsupportedDocumentException;
class PrintAgentOfflineException extends AppException {
    constructor(message = 'No connected agent for shop.') {
        super('PRINT_AGENT_OFFLINE', message, common_1.HttpStatus.SERVICE_UNAVAILABLE);
    }
}
exports.PrintAgentOfflineException = PrintAgentOfflineException;
class DocumentProcessingConflictException extends AppException {
    constructor(message = 'Document is not in the expected state for this operation.') {
        super('DOCUMENT_PROCESSING_CONFLICT', message, common_1.HttpStatus.CONFLICT);
    }
}
exports.DocumentProcessingConflictException = DocumentProcessingConflictException;
//# sourceMappingURL=app.exceptions.js.map