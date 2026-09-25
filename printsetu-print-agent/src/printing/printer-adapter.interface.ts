import type { PrinterDiagnostics } from './print-failure';

export interface PrintOptions {
  paperSize: string;
  colorMode: string;
  sideMode: string;
  copies: number;
}

/** One OS-level printer visible to this computer's print spooler. */
export interface DetectedPrinter {
  name: string;
  /** The OS's own default printer (for the account the agent runs as). */
  isDefault: boolean;
}

/**
 * The spooler call didn't come back (e.g. `lp` hung and was killed), so the
 * job may or may not have been queued. Never retried — resubmitting could
 * print a second copy — and reported as PRINT_UNKNOWN for the shopkeeper to
 * check the printer and reconcile.
 */
export class PrintOutcomeUnknownError extends Error {}

export interface PrinterAdapter {
  /** Resolves once the OS print spooler has *accepted* the job, not once physical printing finishes. */
  print(filePath: string, printerName: string | undefined, options: PrintOptions): Promise<void>;
  listPrinters(): Promise<DetectedPrinter[]>;
  /**
   * Asks the OS about the printer and its spooler, only after a print failed —
   * the print command's own error rarely says *why* (offline, out of paper,
   * spooler stopped). Optional; must never throw.
   */
  diagnose?(printerName: string | undefined): Promise<PrinterDiagnostics | undefined>;
}
