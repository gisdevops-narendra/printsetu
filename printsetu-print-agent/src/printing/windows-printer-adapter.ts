import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as pdfToPrinter from 'pdf-to-printer';
import { DetectedPrinter, PrinterAdapter, PrintOptions } from './printer-adapter.interface';
import { logger } from '../logger';

const SUMATRA_ASSET = 'SumatraPDF-3.4.6-32.exe';

/**
 * pdf-to-printer resolves its bundled SumatraPDF.exe relative to its own
 * __dirname. Under `pkg` that path lives inside the read-only virtual
 * snapshot, which `child_process.execFile` cannot spawn directly — so when
 * packaged, extract it once to a real temp file and pass it explicitly via
 * `sumatraPdfPath` (an option pdf-to-printer already supports). In normal
 * (non-pkg) runs this is a no-op and pdf-to-printer uses its own default.
 */
function resolveSumatraPath(): string | undefined {
  if (!(process as unknown as { pkg?: unknown }).pkg) return undefined;

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
    const printOptions: pdfToPrinter.PrintOptions = {
      printer: printerName,
      copies: options.copies,
      paperSize: options.paperSize,
      // SRS §13.2: "If the exact printer does not support a requested
      // option, the job must fail safely" — pdf-to-printer/SumatraPDF
      // surfaces spooler errors as a rejected promise, which the caller
      // (job-processor.ts) reports as PRINT_FAILED rather than retrying
      // silently.
      monochrome: options.colorMode === 'BW',
      side: options.sideMode === 'DUPLEX' ? 'duplex' : 'simplex',
      sumatraPdfPath: resolveSumatraPath(),
    };
    logger.info(`Submitting ${filePath} to Windows spooler`, { printerName, printOptions });
    await pdfToPrinter.print(filePath, printOptions);
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
}
