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
    expect(finalStatus()).toEqual([
      'job-1',
      'PRINT_FAILED',
      'job-1:0',
      expect.objectContaining({
        message: expect.stringContaining('"Canon" is not installed'),
        errorCode: 'PRINTER_NOT_FOUND',
        errorDetail: expect.stringContaining('installed printers: HP (default)'),
      }),
    ]);
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
    expect(finalStatus()).toEqual([
      'job-1',
      'PRINT_UNKNOWN',
      'job-1:0',
      expect.objectContaining({ message: 'CUPS did not answer', errorCode: 'PRINT_TIMEOUT' }),
    ]);
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
    expect(finalStatus()).toEqual([
      'job-1',
      'PRINT_FAILED',
      'job-1:0',
      expect.objectContaining({ message: expect.stringContaining('several printers') }),
    ]);
  });
});

describe('JobProcessor — failure reasons', () => {
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
  const doc = (n: number) => ({
    documentId: `doc-${n}`,
    originalName: `file-${n}.pdf`,
    mimeType: 'application/pdf',
    options: { paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 1 },
    documentSignedUrl: `https://signed/${n}.pdf`,
  });
  const job = (docs = 1): AgentJobPayload => ({
    jobId: 'job-1',
    attemptId: 'job-1:0',
    printerName: 'HP',
    documents: Array.from({ length: docs }, (_, i) => doc(i + 1)),
  });

  let http: { reportStatus: jest.Mock; downloadToFile: jest.Mock };
  let printer: { print: jest.Mock; listPrinters: jest.Mock; diagnose: jest.Mock };
  const run = (payload: AgentJobPayload) =>
    new JobProcessor(config, http as any, printer as unknown as PrinterAdapter).handle(payload);
  const finalStatus = () => http.reportStatus.mock.calls.at(-1);

  // What SumatraPDF's failed execFile looks like: exit code 1, no output.
  const sumatraExit1 = () =>
    Object.assign(new Error('Command failed: C:\\SumatraPDF.exe -print-to HP -silent x.pdf'), {
      code: 1,
      stdout: '',
      stderr: '',
      cmd: 'C:\\SumatraPDF.exe -print-to HP -silent x.pdf',
    });

  beforeEach(() => {
    http = { reportStatus: jest.fn().mockResolvedValue(undefined), downloadToFile: jest.fn().mockResolvedValue(1234) };
    printer = {
      print: jest.fn().mockResolvedValue(undefined),
      listPrinters: jest.fn().mockResolvedValue([{ name: 'HP', isDefault: true }]),
      diagnose: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('asks the OS why printing failed and reports the printer as offline', async () => {
    printer.print.mockRejectedValue(sumatraExit1());
    printer.diagnose.mockResolvedValue({ spoolerRunning: true, printerFound: true, offline: true, summary: '{"workOffline":true}' });

    await run(job());

    expect(printer.diagnose).toHaveBeenCalledWith('HP');
    const [, status, , failure] = finalStatus()!;
    expect(status).toBe('PRINT_FAILED');
    expect(failure.errorCode).toBe('PRINTER_OFFLINE');
    expect(failure.message).toContain('"HP" is offline');
    expect(failure.errorDetail).toContain('stage=print');
    expect(failure.errorDetail).toContain('exit code 1');
    expect(failure.errorDetail).toContain('printer check: {"workOffline":true}');
  });

  it('names the document that failed and says which ones were already printed', async () => {
    printer.print.mockResolvedValueOnce(undefined).mockRejectedValue(sumatraExit1());
    await run(job(3));
    expect(finalStatus()![3].message).toContain('(document 2 of 3: "file-2.pdf"; document 1 was already sent to the printer)');
  });

  it('reports a download failure without trying to print', async () => {
    http.downloadToFile.mockRejectedValue(Object.assign(new Error('Request failed with status code 403'), { response: { status: 403 } }));
    await run(job());
    expect(printer.print).not.toHaveBeenCalled();
    expect(finalStatus()![3]).toEqual(
      expect.objectContaining({ errorCode: 'DOWNLOAD_FAILED', errorDetail: expect.stringContaining('HTTP 403') }),
    );
  });

  it('keeps the message when a library throws a plain string', async () => {
    printer.print.mockRejectedValue('Operating System not supported');
    await run(job());
    expect(finalStatus()![3]).toEqual(expect.objectContaining({ errorCode: 'UNSUPPORTED_OS' }));
  });

  it('retries the failure report when the backend is briefly unreachable', async () => {
    printer.print.mockRejectedValue(sumatraExit1());
    http.reportStatus.mockImplementation((_id: string, status: string) =>
      status === 'PRINT_FAILED' && http.reportStatus.mock.calls.filter((c) => c[1] === 'PRINT_FAILED').length === 1
        ? Promise.reject(new Error('ECONNRESET'))
        : Promise.resolve(),
    );
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    try {
      const done = run(job());
      await jest.advanceTimersByTimeAsync(10_000);
      await done;
    } finally {
      jest.useRealTimers();
    }
    expect(http.reportStatus.mock.calls.filter((c) => c[1] === 'PRINT_FAILED')).toHaveLength(2);
  });

  it('never turns a printed order into PRINT_FAILED when only the PRINTED report failed', async () => {
    http.reportStatus.mockImplementation((_id: string, status: string) =>
      status === 'PRINTED' && http.reportStatus.mock.calls.filter((c) => c[1] === 'PRINTED').length === 1
        ? Promise.reject(new Error('timeout'))
        : Promise.resolve(),
    );
    await run(job());
    expect(http.reportStatus.mock.calls.map((c) => c[1])).toEqual(['ACCEPTED', 'PRINTING', 'PRINTED', 'PRINTED']);
  });
});
