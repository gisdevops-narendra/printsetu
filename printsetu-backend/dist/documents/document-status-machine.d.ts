import { DocumentStatus } from '@prisma/client';
export declare const DOCUMENT_ALLOWED_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]>;
export declare function canTransitionDocument(from: DocumentStatus, to: DocumentStatus): boolean;
