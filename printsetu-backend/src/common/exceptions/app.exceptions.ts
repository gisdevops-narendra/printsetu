import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base class carrying the SRS §17.3 machine-readable error code alongside
 * the HTTP status, so the exception filter can emit the exact
 * { statusCode, code, message } shape the API spec documents.
 */
export class AppException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus,
  ) {
    super({ code, message }, status);
  }
}

export class InvalidPrintOptionException extends AppException {
  constructor(message = 'Unsupported option or invalid quote.') {
    super('INVALID_PRINT_OPTION', message, HttpStatus.BAD_REQUEST);
  }
}

export class UnauthenticatedException extends AppException {
  constructor(message = 'Missing or invalid authentication.') {
    super('UNAUTHENTICATED', message, HttpStatus.UNAUTHORIZED);
  }
}

export class WeakPasswordException extends AppException {
  constructor(message = 'Password does not meet the minimum requirements.') {
    super('WEAK_PASSWORD', message, HttpStatus.BAD_REQUEST);
  }
}

export class ShopAccessDeniedException extends AppException {
  constructor(message = 'You do not have access to this shop resource.') {
    super('SHOP_ACCESS_DENIED', message, HttpStatus.FORBIDDEN);
  }
}

export class AppNotFoundException extends AppException {
  constructor(message = 'Resource does not exist or is inaccessible.') {
    super('NOT_FOUND', message, HttpStatus.NOT_FOUND);
  }
}

export class JobAlreadyPrintingException extends AppException {
  constructor(message = 'Duplicate print attempt.') {
    super('JOB_ALREADY_PRINTING', message, HttpStatus.CONFLICT);
  }
}

export class FileTooLargeException extends AppException {
  constructor(message = 'Upload exceeds configured limit.') {
    super('FILE_TOO_LARGE', message, HttpStatus.PAYLOAD_TOO_LARGE);
  }
}

export class UnsupportedDocumentException extends AppException {
  constructor(message = 'File cannot be processed safely.') {
    super('UNSUPPORTED_DOCUMENT', message, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

export class PrintAgentOfflineException extends AppException {
  constructor(message = 'No connected agent for shop.') {
    super('PRINT_AGENT_OFFLINE', message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}

export class DocumentProcessingConflictException extends AppException {
  constructor(message = 'Document is not in the expected state for this operation.') {
    super('DOCUMENT_PROCESSING_CONFLICT', message, HttpStatus.CONFLICT);
  }
}

export class EmailAlreadyRegisteredException extends AppException {
  constructor(message = 'An account with this email already exists. Sign in instead.') {
    super('EMAIL_ALREADY_REGISTERED', message, HttpStatus.CONFLICT);
  }
}

/** Registration OTP: wrong, expired, never sent, or tried too many times. */
export class InvalidOtpException extends AppException {
  constructor(message = 'That code is not correct. Check the email and try again.') {
    super('INVALID_OTP', message, HttpStatus.BAD_REQUEST);
  }
}

export class OtpResendTooSoonException extends AppException {
  constructor(seconds: number) {
    super(
      'OTP_RESEND_TOO_SOON',
      `Please wait ${seconds} seconds before asking for a new code.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class EmailSendFailedException extends AppException {
  constructor(
    message = "We couldn't send the email right now. Please try again in a few minutes.",
  ) {
    super('EMAIL_SEND_FAILED', message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
