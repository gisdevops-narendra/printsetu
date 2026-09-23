import { execFile } from 'child_process';
import { promisify } from 'util';
import { DetectedPrinter, PrinterAdapter, PrintOptions, PrintOutcomeUnknownError } from './printer-adapter.interface';
import { logger } from '../logger';

const execFileAsync = promisify(execFile);
const LP_TIMEOUT_MS = 30_000;

// CUPS/IPP standard "media" keywords for the backend's PaperSize enum.
const MEDIA: Record<string, string> = {
  A4: 'A4',
  A3: 'A3',
  LETTER: 'Letter',
  LEGAL: 'Legal',
};

async function run(command: string, args: string[]): Promise<string> {
  // LANG=C keeps lpstat's output in English so the parsing below is stable
  // on shop PCs set to a non-English locale.
  const { stdout } = await execFileAsync(command, args, {
    timeout: LP_TIMEOUT_MS,
    env: { ...process.env, LANG: 'C', LC_ALL: 'C' },
  });
  return stdout;
}

/** Turns an execFile failure into the message worth showing: the tool's own stderr, not just "Command failed". */
function describeFailure(error: unknown): Error {
  const e = error as { killed?: boolean; signal?: string | null; stderr?: string; message: string };
  if (e.killed || e.signal) {
    return new PrintOutcomeUnknownError(
      `CUPS did not answer within ${LP_TIMEOUT_MS / 1000}s — the printer may or may not have received the job. ` +
        'Check the printer before printing again.',
    );
  }
  return new Error(e.stderr?.trim() || e.message);
}

/**
 * Linux counterpart of WindowsPrinterAdapter: submits through CUPS with the
 * standard `lp`/`lpstat` client tools (present on every desktop Ubuntu/
 * Debian/Fedora install, package `cups-client`). CUPS's own filters handle
 * PDF, PNG and JPEG, so no bundled renderer is needed.
 */
export class LinuxPrinterAdapter implements PrinterAdapter {
  async print(filePath: string, printerName: string | undefined, options: PrintOptions): Promise<void> {
    const args: string[] = [];
    if (printerName) args.push('-d', printerName);
    args.push('-n', String(Math.max(1, options.copies)));
    const media = MEDIA[options.paperSize];
    if (media) args.push('-o', `media=${media}`);
    args.push('-o', `sides=${options.sideMode === 'DUPLEX' ? 'two-sided-long-edge' : 'one-sided'}`);
    if (options.colorMode === 'BW') args.push('-o', 'print-color-mode=monochrome');
    args.push('--', filePath);

    logger.info(`Submitting ${filePath} to CUPS`, { printerName, args });
    const stdout = await run('lp', args).catch((error) => {
      throw describeFailure(error);
    });
    logger.info(`CUPS accepted job: ${stdout.trim()}`);
  }

  async listPrinters(): Promise<DetectedPrinter[]> {
    // `lpstat -e` lists every destination name, one per line; `lpstat -d`
    // prints either "system default destination: NAME" or "no system
    // default destination". A CUPS install with zero printers makes
    // `lpstat -e` exit non-zero on some versions, which just means "none".
    const [names, defaultOut] = await Promise.all([
      run('lpstat', ['-e']).catch(() => ''),
      run('lpstat', ['-d']).catch(() => ''),
    ]);
    const defaultName = /system default destination:\s*(\S+)/.exec(defaultOut)?.[1];
    return names
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((name) => ({ name, isDefault: name === defaultName }));
  }
}
