import * as os from 'os';
import { BackendHttpClient, PrinterReport } from './http-client';
import { PrinterAdapter } from './printing/printer-adapter.interface';
import { logger } from './logger';

/**
 * Keeps the backend's copy of "which printers does this computer have" in
 * sync, so the shopkeeper's dashboard can offer them as choices. Scans on a
 * timer but only uploads when something changed — except when forced (fresh
 * socket connection, or the shopkeeper clicked "refresh" on the dashboard).
 */
export class PrinterReporter {
  private lastSent: string | null = null;
  private running = false;

  constructor(
    private readonly http: BackendHttpClient,
    private readonly printer: PrinterAdapter,
  ) {}

  async report(force = false): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const report: PrinterReport = {
        printers: await this.printer.listPrinters(),
        platform: process.platform,
        hostname: os.hostname(),
      };
      const serialized = JSON.stringify(report);
      if (!force && serialized === this.lastSent) return;
      await this.http.reportPrinters(report);
      this.lastSent = serialized;
      logger.info(`Reported ${report.printers.length} printer(s) to backend`, {
        printers: report.printers.map((p) => (p.isDefault ? `${p.name} (default)` : p.name)),
      });
    } catch (error) {
      logger.warn(`Could not report printers: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
