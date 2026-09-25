import { PrintOutcomeUnknownError } from './printer-adapter.interface';

/**
 * What kind of problem stopped an order. Sent to the backend alongside the
 * plain-language message so failures can be grouped and searched remotely.
 */
export type PrintFailureCode =
  | 'PRINTER_NOT_FOUND'
  | 'PRINTER_OFFLINE'
  | 'PRINTER_PROBLEM'
  | 'SPOOLER_ERROR'
  | 'ACCESS_DENIED'
  | 'PRINT_PROGRAM_ERROR'
  | 'PRINT_COMMAND_FAILED'
  | 'PRINT_TIMEOUT'
  | 'DOWNLOAD_FAILED'
  | 'FILE_ERROR'
  | 'DISK_ERROR'
  | 'UNSUPPORTED_OS'
  | 'UNKNOWN';

/** Which step of an order was running when it failed. */
export type JobStage = 'report' | 'choose-printer' | 'download' | 'print' | 'report-printed';

/**
 * What the OS said about the printer right after a failed print — the print
 * program itself (SumatraPDF with -silent) usually exits with just "1", so
 * this is what actually tells us "offline", "out of paper" or "spooler stopped".
 */
export interface PrinterDiagnostics {
  /** false = the Windows Print Spooler service / CUPS scheduler is not running. */
  spoolerRunning?: boolean;
  /** false = the OS does not know a printer by that name. */
  printerFound?: boolean;
  offline?: boolean;
  /** Plain-language problem the printer reports, e.g. "out of paper". */
  problem?: string;
  /** Everything the OS returned, for the technical details. */
  summary: string;
}

/**
 * An order failure with both audiences in mind: `message` is a plain
 * sentence the shopkeeper sees on Print Orders, `detail` is the raw
 * technical evidence (exit codes, stderr, spooler state) for remote support.
 */
export class PrintFailure extends Error {
  constructor(
    readonly code: PrintFailureCode,
    message: string,
    readonly detail: string,
    /** The spooler may already hold the order — report PRINT_UNKNOWN, never retry. */
    readonly outcomeUnknown = false,
  ) {
    super(message);
    this.name = 'PrintFailure';
  }
}

/** Raw evidence a failed child process / Node API call leaves behind. */
interface ErrorFacts {
  message: string;
  /** Exit status of a child process (execFile puts it in `code` as a number). */
  exitCode?: number;
  /** Node errno code such as ENOENT, EACCES, ECONNRESET. */
  errno?: string;
  signal?: string;
  killed?: boolean;
  stderr?: string;
  stdout?: string;
  cmd?: string;
  httpStatus?: number;
}

/** Libraries sometimes throw strings (pdf-to-printer throws "Operating System not supported") — never lose them. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function factsOf(error: unknown): ErrorFacts {
  if (typeof error !== 'object' || error === null) return { message: errorMessage(error) };
  const e = error as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const response = e.response as { status?: number } | undefined;
  return {
    message: errorMessage(error),
    exitCode: typeof e.code === 'number' ? e.code : undefined,
    errno: typeof e.code === 'string' ? e.code : undefined,
    signal: str(e.signal),
    killed: e.killed === true,
    stderr: str(e.stderr),
    stdout: str(e.stdout),
    cmd: str(e.cmd),
    httpStatus: response?.status,
  };
}

function describeFacts(f: ErrorFacts): string {
  const parts: string[] = [];
  if (f.exitCode !== undefined) parts.push(`exit code ${f.exitCode}`);
  if (f.errno) parts.push(`error ${f.errno}`);
  if (f.signal) parts.push(`signal ${f.signal}`);
  if (f.killed) parts.push('process killed');
  if (f.httpStatus) parts.push(`HTTP ${f.httpStatus}`);
  if (f.stderr) parts.push(`stderr: ${f.stderr}`);
  if (f.stdout) parts.push(`stdout: ${f.stdout}`);
  // execFile's message repeats the whole command line; keep it once, under "command".
  if (f.cmd) parts.push(`command: ${f.cmd}`);
  else parts.push(`message: ${f.message}`);
  return parts.join('; ');
}

/** Everything a thrown value carries (exit code, stderr, errno, HTTP status), for logs and the failure report. */
export function describeError(error: unknown): string {
  return error instanceof PrintFailure ? error.detail : describeFacts(factsOf(error));
}

const thePrinter = (printerName: string | undefined) => (printerName ? `the printer "${printerName}"` : 'the printer');
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Turns whatever the print step threw — a SumatraPDF/`lp` exit, a spawn
 * error, a pdf-to-printer string — plus what the OS says about the printer
 * right afterwards, into one classified PrintFailure.
 */
export function classifyPrintError(
  error: unknown,
  printerName: string | undefined,
  diagnostics?: PrinterDiagnostics,
): PrintFailure {
  if (error instanceof PrintFailure) return error;
  const f = factsOf(error);
  const printer = thePrinter(printerName);
  const Printer = capitalize(printer);
  const detail = [describeFacts(f), diagnostics ? `printer check: ${diagnostics.summary}` : undefined]
    .filter(Boolean)
    .join(' | ');
  const text = [f.message, f.stderr, f.stdout].filter(Boolean).join(' ').toLowerCase();

  if (error instanceof PrintOutcomeUnknownError || f.killed || f.signal) {
    return new PrintFailure(
      'PRINT_TIMEOUT',
      f.killed || f.signal
        ? 'The printer did not finish taking the order in time — it may or may not have printed. Check the printer before printing again.'
        : f.message,
      detail,
      true,
    );
  }
  if (/operating system not supported/.test(text)) {
    return new PrintFailure('UNSUPPORTED_OS', 'The Printer App cannot print on this kind of computer.', detail);
  }
  // The print program itself could not start: missing, or blocked/quarantined by antivirus.
  if (f.errno && ['ENOENT', 'EACCES', 'EPERM', 'UNKNOWN'].includes(f.errno) && /spawn/.test(text)) {
    return new PrintFailure(
      'PRINT_PROGRAM_ERROR',
      'The Printer App could not start its print program. It may have been blocked by antivirus software — reinstall the Printer App and try again.',
      detail,
    );
  }
  if (diagnostics?.spoolerRunning === false || /spooler|rpc server is unavailable|0x800706ba|0x800706b9|scheduler is not running/.test(text)) {
    return new PrintFailure(
      'SPOOLER_ERROR',
      "Windows' printing service is not running on this computer. Restart the computer, then print again.",
      detail,
    );
  }
  if (
    f.errno === 'EACCES' ||
    f.errno === 'EPERM' ||
    /access (is )?denied|permission denied|not authorized|forbidden|0x80070005/.test(text)
  ) {
    return new PrintFailure(
      'ACCESS_DENIED',
      `${Printer} refused the order because the Printer App is not allowed to use it. Check the printer's sharing and security settings.`,
      detail,
    );
  }
  if (
    diagnostics?.printerFound === false ||
    /printer.{0,20}(doesn't|does not|not) exist|unknown printer|invalid printer|printer not found|invalid destination|0x80070709/.test(text)
  ) {
    return new PrintFailure(
      'PRINTER_NOT_FOUND',
      `${Printer} was not found on this computer. Check that it is installed, or choose a printer again on the Printer App page.`,
      detail,
    );
  }
  if (diagnostics?.offline || /offline|not connected/.test(text)) {
    return new PrintFailure(
      'PRINTER_OFFLINE',
      `${Printer} is offline. Check that it is switched on and connected, then print again.`,
      detail,
    );
  }
  if (diagnostics?.problem) {
    return new PrintFailure(
      'PRINTER_PROBLEM',
      `${Printer} reports a problem: ${diagnostics.problem}. Fix it on the printer, then print again.`,
      detail,
    );
  }
  if (f.errno === 'ENOSPC') {
    return new PrintFailure('DISK_ERROR', 'This computer has run out of disk space. Free up some space, then print again.', detail);
  }
  if (/no such file|cannot open|couldn't open|failed to load|damaged|corrupt|password/.test(text)) {
    return new PrintFailure(
      'FILE_ERROR',
      'The document could not be opened for printing. It may be damaged or password-protected.',
      detail,
    );
  }
  if (/sumatra/.test(text) || f.cmd?.toLowerCase().includes('sumatra')) {
    return new PrintFailure(
      'PRINT_PROGRAM_ERROR',
      `The print program could not send the document to ${printer}. Check the printer, then print again.`,
      detail,
    );
  }
  if (f.exitCode !== undefined) {
    return new PrintFailure(
      'PRINT_COMMAND_FAILED',
      `The print command was rejected by ${printer}. Check the printer, then print again.`,
      detail,
    );
  }
  return new PrintFailure('UNKNOWN', `Printing failed: ${f.message}`, detail);
}

/** Classifies a failed download of the document from cloud storage to this computer. */
export function classifyDownloadError(error: unknown): PrintFailure {
  if (error instanceof PrintFailure) return error;
  const f = factsOf(error);
  const detail = describeFacts(f);

  if (f.errno === 'ENOSPC') {
    return new PrintFailure('DISK_ERROR', 'This computer has run out of disk space. Free up some space, then print again.', detail);
  }
  if (f.errno === 'EACCES' || f.errno === 'EPERM') {
    return new PrintFailure(
      'ACCESS_DENIED',
      "The Printer App is not allowed to save files on this computer. Reinstall the Printer App, then print again.",
      detail,
    );
  }
  if (f.httpStatus === 403 || f.httpStatus === 404) {
    return new PrintFailure(
      'DOWNLOAD_FAILED',
      'The document is no longer available to download. Press Print again; if it keeps failing, ask the customer to upload it again.',
      detail,
    );
  }
  if (f.errno && /^(ECONNABORTED|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH|ERR_NETWORK)$/.test(f.errno)) {
    return new PrintFailure(
      'DOWNLOAD_FAILED',
      "The document could not be downloaded because this computer's internet connection is not working. Check the internet, then print again.",
      detail,
    );
  }
  return new PrintFailure('DOWNLOAD_FAILED', 'The document could not be downloaded to this computer. Print again.', detail);
}
