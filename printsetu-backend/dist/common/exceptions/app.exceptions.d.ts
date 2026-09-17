import { HttpException, HttpStatus } from '@nestjs/common';
export declare class AppException extends HttpException {
    readonly code: string;
    constructor(code: string, message: string, status: HttpStatus);
}
export declare class InvalidPrintOptionException extends AppException {
    constructor(message?: string);
}
export declare class UnauthenticatedException extends AppException {
    constructor(message?: string);
}
export declare class ShopAccessDeniedException extends AppException {
    constructor(message?: string);
}
export declare class AppNotFoundException extends AppException {
    constructor(message?: string);
}
export declare class JobAlreadyPrintingException extends AppException {
    constructor(message?: string);
}
export declare class FileTooLargeException extends AppException {
    constructor(message?: string);
}
export declare class UnsupportedDocumentException extends AppException {
    constructor(message?: string);
}
export declare class PrintAgentOfflineException extends AppException {
    constructor(message?: string);
}
export declare class DocumentProcessingConflictException extends AppException {
    constructor(message?: string);
}
