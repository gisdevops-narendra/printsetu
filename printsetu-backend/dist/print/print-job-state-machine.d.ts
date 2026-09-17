import { PrintJobStatus } from '@prisma/client';
export declare const ALLOWED_TRANSITIONS: Record<PrintJobStatus, PrintJobStatus[]>;
export declare function canTransition(from: PrintJobStatus, to: PrintJobStatus): boolean;
