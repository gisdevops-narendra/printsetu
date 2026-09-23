import * as os from 'os';
import * as path from 'path';
import { AgentConfig } from './config';
import { AgentJobPayload } from './http-client';
import { JobProcessor } from './job-processor';
import { DetectedPrinter, PrinterAdapter, PrintOutcomeUnknownError } from './printing/printer-adapter.interface';

jest.mock('./logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

describe('JobProcessor — choosing the OS printer', () => {
  const config: AgentConfig = {
    agentId: 'a',
    agentSecret: 's',
    backendWsUrl: 'ws://x',
    backendHttpUrl: 'http://x',
    pollIntervalMs: 1000,
    heartbeatIntervalMs: 1000,
    printDriver: 'mock',
    downloadDir: path.join(os.tmpdir(), 'printsetu-agent-spec'),
  };

  const job = (printerName: string | null): AgentJobPayload => ({
    jobId: 'job-1',
    attemptId: 'job-1:0',
    printerName,
    documents: [
      {
        documentId: 'doc-1',
        originalName: 'a.pdf',
        mimeType: 'application/pdf',
        options: { paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 1 },
        documentSignedUrl: 'https://signed/a.pdf',
      },
    ],
  });

  let http: { reportStatus: jest.Mock; downloadToFile: jest.Mock };
  let printer: { print: jest.Mock; listPrinters: jest.Mock };

  const run = (payload: AgentJobPayload, cfg: Partial<AgentConfig> = {}) =>
    new JobProcessor({ ...config, ...cfg }, http as any, printer as unknown as PrinterAdapter).handle(payload);

  const installed = (list: DetectedPrinter[]) => printer.listPrinters.mockResolvedValue(list);
  const finalStatus = () => http.reportStatus.mock.calls.at(-1);

  beforeEach(() => {
    http = { reportStatus: jest.fn().mockResolvedValue(undefined), downloadToFile: jest.fn().mockResolvedValue(undefined) };
    printer = { print: jest.fn().mockResolvedValue(undefined), listPrinters: jest.fn() };
  });

  it('prints on the printer chosen on the dashboard', async () => {
    installed([
      { name: 'HP', isDefault: true },
      { name: 'Canon', isDefault: false },
    ]);
    await run(job('Canon'));
    expect(printer.print).toHaveBeenCalledWith(expect.any(String), 'Canon', expect.any(Object));
    expect(finalStatus()).toEqual(['job-1', 'PRINTED', 'job-1:0']);
  });

  it('fails the job when the chosen printer is no longer installed', async () => {
    installed([{ name: 'HP', isDefault: true }]);
    await run(job('Canon'));
    expect(printer.print).not.toHaveBeenCalled();
    expect(finalStatus()).toEqual(['job-1', 'PRINT_FAILED', 'job-1:0', expect.stringContaining('"Canon" is not installed')]);
  });

  it('ignores a stale config printerName (the old "Print Agent" label) and uses the OS default', async () => {
    installed([
      { name: 'HP', isDefault: false },
      { name: 'Canon', isDefault: true },
    ]);
    await run(job(null), { printerName: 'Print Agent' });
    expect(printer.print).toHaveBeenCalledWith(expect.any(String), 'Canon', expect.any(Object));
  });

  it('uses the only installed printer when there is no OS default', async () => {
    installed([{ name: 'HP', isDefault: false }]);
    await run(job(null));
    expect(printer.print).toHaveBeenCalledWith(expect.any(String), 'HP', expect.any(Object));
  });

  it('never resubmits when the spooler outcome is unknown, and reports PRINT_UNKNOWN', async () => {
    installed([{ name: 'HP', isDefault: true }]);
    printer.print.mockRejectedValue(new PrintOutcomeUnknownError('CUPS did not answer'));
    await run(job('HP'));
    expect(printer.print).toHaveBeenCalledTimes(1);
    expect(finalStatus()).toEqual(['job-1', 'PRINT_UNKNOWN', 'job-1:0', 'CUPS did not answer']);
  });

  it('retries once on an ordinary spooler error', async () => {
    installed([{ name: 'HP', isDefault: true }]);
    printer.print.mockRejectedValueOnce(new Error('transient')).mockResolvedValueOnce(undefined);
    await run(job('HP'));
    expect(printer.print).toHaveBeenCalledTimes(2);
    expect(finalStatus()).toEqual(['job-1', 'PRINTED', 'job-1:0']);
  });

  it('refuses to guess between several printers with no default', async () => {
    installed([
      { name: 'HP', isDefault: false },
      { name: 'Canon', isDefault: false },
    ]);
    await run(job(null));
    expect(printer.print).not.toHaveBeenCalled();
    expect(finalStatus()).toEqual(['job-1', 'PRINT_FAILED', 'job-1:0', expect.stringContaining('several printers')]);
  });
});
