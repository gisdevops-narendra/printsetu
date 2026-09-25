import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import { AgentConfig } from './config';
import { logger } from './logger';
import { DetectedPrinter } from './printing/printer-adapter.interface';

export interface AgentJobDocument {
  documentId: string;
  originalName: string;
  mimeType: string;
  options: { paperSize: string; colorMode: string; sideMode: string; copies: number };
  documentSignedUrl: string;
}

export interface AgentJobPayload {
  jobId: string;
  attemptId: string;
  // OS printer the shopkeeper picked for this agent on the dashboard, or
  // null to let the agent choose (see JobProcessor.resolvePrinter).
  printerName?: string | null;
  // One print request can cover several documents, each with its own
  // options — printed in array order.
  documents: AgentJobDocument[];
}

export type AgentJobStatus = 'ACCEPTED' | 'PRINTING' | 'PRINTED' | 'PRINT_FAILED' | 'PRINT_UNKNOWN';

/** Why an order failed: `message` is shown to the shopkeeper, the rest is for remote troubleshooting. */
export interface FailureReport {
  message: string;
  errorCode?: string;
  errorDetail?: string;
}

export interface PrinterReport {
  printers: DetectedPrinter[];
  platform: string;
  hostname: string;
}

/** HTTP side of the agent contract (SRS §17): polling fallback + status reporting. */
export class BackendHttpClient {
  private readonly http: AxiosInstance;

  constructor(private readonly config: AgentConfig) {
    this.http = axios.create({
      baseURL: config.backendHttpUrl,
      headers: { Authorization: `Bearer ${config.agentId}.${config.agentSecret}` },
      timeout: 15_000,
    });
  }

  async pollNextJob(): Promise<AgentJobPayload | null> {
    const { data } = await this.http.get('/agent/jobs/next');
    return data.job ?? null;
  }

  async reportStatus(jobId: string, status: AgentJobStatus, agentAttemptId: string, failure?: FailureReport): Promise<void> {
    try {
      await this.http.post(`/agent/jobs/${jobId}/status`, { status, agentAttemptId, ...failure });
    } catch (error) {
      throw new Error(`Reporting ${status} for job ${jobId} failed: ${describeHttpError(error)}`);
    }
  }

  /** Tells the backend which OS printers this computer can print to, so the shopkeeper can pick one. */
  async reportPrinters(report: PrinterReport): Promise<void> {
    await this.http.post('/agent/printers', report);
  }

  async heartbeat(): Promise<void> {
    await this.http.post('/agent/heartbeat');
  }

  /** Resolves with the number of bytes written. */
  async downloadToFile(url: string, destPath: string): Promise<number> {
    const response = await axios.get(url, { responseType: 'stream', timeout: 60_000 });
    await new Promise<void>((resolve, reject) => {
      const writer = fs.createWriteStream(destPath);
      // A connection dropped mid-download errors the *response* stream; without
      // this listener the writer never finishes and the order hangs in PRINTING.
      response.data.on('error', (error: Error) => {
        writer.destroy();
        reject(error);
      });
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    const size = fs.statSync(destPath).size;
    const expected = Number(response.headers['content-length']);
    if (size === 0 || (expected > 0 && size !== expected)) {
      throw new Error(`Downloaded file is incomplete: got ${size} bytes, expected ${expected || 'more than 0'}`);
    }
    return size;
  }

  async safeHeartbeat(): Promise<void> {
    try {
      await this.heartbeat();
    } catch (error) {
      logger.warn(`Heartbeat failed: ${(error as Error).message}`);
    }
  }
}

/** Axios's own message is just "Request failed with status code 400" — add what the backend said. */
export function describeHttpError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data;
    const bodyText = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    return [error.message, error.code, bodyText.slice(0, 500)].filter(Boolean).join(' — ');
  }
  return error instanceof Error ? error.message : String(error);
}
