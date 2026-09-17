import * as fs from 'fs';
import * as path from 'path';
import { PrinterAdapter, PrintOptions } from './printer-adapter.interface';
import { logger } from '../logger';

/**
 * Dev/CI stand-in used whenever PRINTSETU_PRINT_DRIVER=mock or the agent
 * is running off-Windows (this repo's dev/test machines are Linux). It
 * "prints" by copying the file into ./printed-output so the full
 * dispatch -> download -> print -> report pipeline can be exercised
 * end-to-end without a real printer or Windows host.
 */
export class MockPrinterAdapter implements PrinterAdapter {
  private readonly outputDir = path.join(process.cwd(), 'printed-output');

  async print(filePath: string, printerName: string | undefined, options: PrintOptions): Promise<void> {
    if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
    const destination = path.join(this.outputDir, `${Date.now()}-${path.basename(filePath)}`);
    fs.copyFileSync(filePath, destination);
    logger.info(`[MOCK PRINT] ${filePath} -> ${destination}`, { printerName, options });
  }

  async listPrinters(): Promise<string[]> {
    return ['Mock-Printer-1'];
  }
}
