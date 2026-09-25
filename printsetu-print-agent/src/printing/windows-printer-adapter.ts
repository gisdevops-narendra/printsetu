import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import * as pdfToPrinter from 'pdf-to-printer';
import { DetectedPrinter, PrinterAdapter, PrintOptions, PrintOutcomeUnknownError } from './printer-adapter.interface';
import { errorMessage, PrinterDiagnostics, PrintFailure } from './print-failure';
import { logger } from '../logger';

const execFileAsync = promisify(execFile);
const SUMATRA_ASSET = 'SumatraPDF-3.4.6-32.exe';
// SumatraPDF renders the whole document before it returns, so a long PDF
// legitimately takes a while — but a driver stuck on a hidden dialog (the
// agent runs as SYSTEM, with no desktop) would otherwise hang the order in
// PRINTING forever.
const SUMATRA_TIMEOUT_MS = 180_000;
const DIAGNOSE_TIMEOUT_MS = 20_000;

// Win32_Printer.ExtendedPrinterStatus / DetectedErrorState values that mean
// the printer cannot print right now, in the shopkeeper's words.
const EXTENDED_STATUS_PROBLEM: Record<number, string> = {
  6: 'stopped printing',
  8: 'paused',
  9: 'in an error state',
  11: 'not available',
};
const DETECTED_ERROR_PROBLEM: Record<number, string> = {
  4: 'out of paper',
  6: 'out of toner or ink',
  7: 'a door or cover is open',
  8: 'paper jam',
  10: 'needs service',
  11: 'output tray is full',
};

/**
 * The printer name comes in through an environment variable, not the script
 * text, so a name with quotes or backslashes (\\server\\share) can't break
 * or inject into the PowerShell command.
 */
const DIAGNOSE_SCRIPT = [
  '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
  "$ErrorActionPreference = 'SilentlyContinue'",
  '$name = $env:PRINTSETU_DIAG_PRINTER',
  '$svc = Get-Service -Name Spooler',
  "$p = if ($name) { Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $name } | Select-Object -First 1 } else { Get-CimInstance Win32_Printer -Filter 'Default=true' | Select-Object -First 1 }",
  '$jobs = if ($p) { @(Get-CimInstance Win32_PrintJob | Where-Object { $_.Name -like ($p.Name + \',*\') }).Count } else { 0 }',
  "[pscustomobject]@{ spooler = if ($svc) { $svc.Status.ToString() } else { 'NotFound' }; found = [bool]$p; name = $p.Name; printerStatus = $p.PrinterStatus; extendedStatus = $p.ExtendedPrinterStatus; errorState = $p.DetectedErrorState; workOffline = $p.WorkOffline; portName = $p.PortName; driverName = $p.DriverName; queuedJobs = $jobs } | ConvertTo-Json -Compress",
].join('; ');

interface WindowsPrinterState {
  spooler?: string;
  found?: boolean;
  name?: string | null;
  printerStatus?: number | null;
  extendedStatus?: number | null;
  errorState?: number | null;
  workOffline?: boolean | null;
  portName?: string | null;
  driverName?: string | null;
  queuedJobs?: number;
}

/**
 * SumatraPDF.exe ships inside the pdf-to-printer package. Under `pkg` that
 * path lives inside the read-only virtual snapshot, which
 * `child_process.execFile` cannot spawn directly — so when packaged, extract
 * it once to a real temp file. In normal (non-pkg) runs the package's own
 * copy is used.
 */
function resolveSumatraPath(): string {
  if (!(process as unknown as { pkg?: unknown }).pkg) {
    return path.join(path.dirname(require.resolve('pdf-to-printer')), SUMATRA_ASSET);
  }

  const extractedPath = path.join(os.tmpdir(), 'printsetu-agent', SUMATRA_ASSET);
  if (!fs.existsSync(extractedPath)) {
    const snapshotPath = path.join(__dirname, '..', '..', 'node_modules', 'pdf-to-printer', 'dist', SUMATRA_ASSET);
    fs.mkdirSync(path.dirname(extractedPath), { recursive: true });
    fs.writeFileSync(extractedPath, fs.readFileSync(snapshotPath));
  }
  return extractedPath;
}

/**
 * SRS §13.1/13.2: submits the file to the configured Windows printer via
 * the OS print spooler (through SumatraPDF, bundled by pdf-to-printer —
 * no custom native driver code, and it works for both PDF and raster
 * images). Only runs on win32; see PrinterAdapterFactory.
 */
export class WindowsPrinterAdapter implements PrinterAdapter {
  async print(filePath: string, printerName: string | undefined, options: PrintOptions): Promise<void> {
    if (!fs.existsSync(filePath)) throw new Error(`No such file: ${filePath}`);

    // The same SumatraPDF command line pdf-to-printer builds, run directly so
    // it can be given a timeout and its exit code/output kept for the report.
    // SRS §13.2: "If the exact printer does not support a requested option,
    // the job must fail safely" — SumatraPDF exits non-zero, which the caller
    // (job-processor.ts) reports as PRINT_FAILED.
    const settings = [
      options.colorMode === 'BW' ? 'monochrome' : 'color',
      options.sideMode === 'DUPLEX' ? 'duplex' : 'simplex',
      `paper=${options.paperSize}`,
    ];
    if (options.copies) settings.push(`${options.copies}x`);
    const args = [
      ...(printerName ? ['-print-to', printerName] : ['-print-to-default']),
      '-silent',
      '-print-settings',
      settings.join(','),
      filePath,
    ];
    let sumatraPath: string;
    try {
      sumatraPath = resolveSumatraPath();
    } catch (error) {
      throw new PrintFailure(
        'PRINT_PROGRAM_ERROR',
        'The Printer App could not prepare its print program. Reinstall the Printer App and try again.',
        `extracting ${SUMATRA_ASSET} failed: ${errorMessage(error)}`,
      );
    }

    logger.info(`Submitting ${filePath} to Windows spooler`, { printerName, sumatraPath, args });
    const started = Date.now();
    const { stdout, stderr } = await execFileAsync(sumatraPath, args, {
      timeout: SUMATRA_TIMEOUT_MS,
      windowsHide: true,
    }).catch((error: { killed?: boolean; signal?: string | null }) => {
      // Killed by the timeout: the spooler may already hold the order, so it must not be retried.
      if (error.killed || error.signal) {
        throw new PrintOutcomeUnknownError(
          `The printer did not finish taking the order within ${SUMATRA_TIMEOUT_MS / 60_000} minutes — it may or may not have printed. ` +
            'Check the printer before printing again.',
        );
      }
      throw error;
    });
    logger.info(`SumatraPDF handed the document to the spooler in ${Date.now() - started}ms`, {
      stdout: stdout.trim() || undefined,
      stderr: stderr.trim() || undefined,
    });
  }

  async listPrinters(): Promise<DetectedPrinter[]> {
    const [printers, defaultPrinter] = await Promise.all([
      pdfToPrinter.getPrinters(),
      // The agent runs as SYSTEM (see service/Install-Task.ps1), which often
      // has no default printer of its own — treat that as "none", not an error.
      pdfToPrinter.getDefaultPrinter().catch(() => null),
    ]);
    return printers.map((p) => ({ name: p.name, isDefault: p.name === defaultPrinter?.name }));
  }

  async diagnose(printerName: string | undefined): Promise<PrinterDiagnostics | undefined> {
    try {
      const { stdout } = await execFileAsync('Powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', DIAGNOSE_SCRIPT], {
        timeout: DIAGNOSE_TIMEOUT_MS,
        windowsHide: true,
        env: { ...process.env, PRINTSETU_DIAG_PRINTER: printerName ?? '' },
      });
      return interpretWindowsState(JSON.parse(stdout.trim()) as WindowsPrinterState);
    } catch (error) {
      logger.warn(`Could not check the printer's state after the failure: ${errorMessage(error)}`);
      return undefined;
    }
  }
}

function interpretWindowsState(state: WindowsPrinterState): PrinterDiagnostics {
  const problems = [
    state.extendedStatus != null ? EXTENDED_STATUS_PROBLEM[state.extendedStatus] : undefined,
    state.errorState != null ? DETECTED_ERROR_PROBLEM[state.errorState] : undefined,
  ].filter((p): p is string => !!p);
  return {
    spoolerRunning: state.spooler === 'Running',
    printerFound: state.found === true,
    // PrinterStatus/ExtendedPrinterStatus 7 and DetectedErrorState 9 all mean "offline".
    offline: state.workOffline === true || state.printerStatus === 7 || state.extendedStatus === 7 || state.errorState === 9,
    problem: problems.length ? problems.join(', ') : undefined,
    summary: JSON.stringify(state),
  };
}
