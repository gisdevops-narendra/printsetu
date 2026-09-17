import * as pdfToPrinter from 'pdf-to-printer';
import { PrinterAdapter, PrintOptions } from './printer-adapter.interface';
import { logger } from '../logger';

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
    };
    logger.info(`Submitting ${filePath} to Windows spooler`, { printerName, printOptions });
    await pdfToPrinter.print(filePath, printOptions);
  }

  async listPrinters(): Promise<string[]> {
    const printers = await pdfToPrinter.getPrinters();
    return printers.map((p) => p.name);
  }
}
