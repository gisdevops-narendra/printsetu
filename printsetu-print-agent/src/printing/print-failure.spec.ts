import { classifyDownloadError, classifyPrintError, errorMessage } from './print-failure';
import { PrintOutcomeUnknownError } from './printer-adapter.interface';

const execError = (props: Record<string, unknown>) =>
  Object.assign(new Error(`Command failed: ${props.cmd ?? 'x'}`), { stdout: '', stderr: '', ...props });

describe('classifyPrintError', () => {
  const healthy = { spoolerRunning: true, printerFound: true, offline: false, summary: 'ok' };

  it.each([
    ['spooler stopped', execError({ code: 1 }), { ...healthy, spoolerRunning: false }, 'SPOOLER_ERROR'],
    ['printer removed', execError({ code: 1 }), { ...healthy, printerFound: false }, 'PRINTER_NOT_FOUND'],
    ['printer offline', execError({ code: 1 }), { ...healthy, offline: true }, 'PRINTER_OFFLINE'],
    ['paper jam', execError({ code: 1 }), { ...healthy, problem: 'paper jam' }, 'PRINTER_PROBLEM'],
    ['RPC spooler error text', execError({ code: 1, stderr: 'The RPC server is unavailable' }), undefined, 'SPOOLER_ERROR'],
    ['access denied', execError({ code: 5, stderr: 'Access is denied.' }), undefined, 'ACCESS_DENIED'],
    ['CUPS unknown printer', execError({ code: 1, stderr: 'lp: The printer or class does not exist.' }), undefined, 'PRINTER_NOT_FOUND'],
    ['Sumatra blocked by antivirus', Object.assign(new Error('spawn C:\\t\\SumatraPDF.exe EACCES'), { code: 'EACCES' }), undefined, 'PRINT_PROGRAM_ERROR'],
    ['Sumatra exit 1, printer looks fine', execError({ code: 1, cmd: 'C:\\SumatraPDF.exe -print-to HP' }), healthy, 'PRINT_PROGRAM_ERROR'],
    ['lp exit 1, no hint', execError({ code: 1, cmd: 'lp -d HP' }), healthy, 'PRINT_COMMAND_FAILED'],
    ['disk full', Object.assign(new Error('ENOSPC: no space left'), { code: 'ENOSPC' }), undefined, 'DISK_ERROR'],
    ['plain string from pdf-to-printer', 'Operating System not supported', undefined, 'UNSUPPORTED_OS'],
  ])('%s -> %s', (_label, error, diagnostics, code) => {
    expect(classifyPrintError(error, 'HP', diagnostics).code).toBe(code);
  });

  it('keeps the raw evidence in the detail', () => {
    const failure = classifyPrintError(execError({ code: 1, stderr: 'driver said no', cmd: 'lp -d HP f.pdf' }), 'HP', healthy);
    expect(failure.detail).toBe('exit code 1; stderr: driver said no; command: lp -d HP f.pdf | printer check: ok');
  });

  it('treats a spooler timeout as an unknown outcome', () => {
    const failure = classifyPrintError(new PrintOutcomeUnknownError('did not answer'), 'HP');
    expect(failure.code).toBe('PRINT_TIMEOUT');
    expect(failure.outcomeUnknown).toBe(true);
    expect(failure.message).toBe('did not answer');
  });
});

describe('classifyDownloadError', () => {
  it('explains an expired link', () => {
    const f = classifyDownloadError(Object.assign(new Error('Request failed with status code 403'), { response: { status: 403 } }));
    expect(f.message).toContain('no longer available');
    expect(f.detail).toContain('HTTP 403');
  });

  it('explains a network failure', () => {
    const f = classifyDownloadError(Object.assign(new Error('getaddrinfo ENOTFOUND s3'), { code: 'ENOTFOUND' }));
    expect(f.message).toContain('internet connection');
  });
});

describe('errorMessage', () => {
  it('never returns undefined for non-Error throws', () => {
    expect(errorMessage('boom')).toBe('boom');
    expect(errorMessage({ a: 1 })).toBe('{"a":1}');
  });
});
