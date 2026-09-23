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

  async reportStatus(jobId: string, status: AgentJobStatus, agentAttemptId: string, message?: string): Promise<void> {
    await this.http.post(`/agent/jobs/${jobId}/status`, { status, agentAttemptId, message });
  }

  /** Tells the backend which OS printers this computer can print to, so the shopkeeper can pick one. */
  async reportPrinters(report: PrinterReport): Promise<void> {
    await this.http.post('/agent/printers', report);
  }

  async heartbeat(): Promise<void> {
    await this.http.post('/agent/heartbeat');
  }

  async downloadToFile(url: string, destPath: string): Promise<void> {
    const response = await axios.get(url, { responseType: 'stream', timeout: 60_000 });
    await new Promise<void>((resolve, reject) => {
      const writer = fs.createWriteStream(destPath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  async safeHeartbeat(): Promise<void> {
    try {
      await this.heartbeat();
    } catch (error) {
      logger.warn(`Heartbeat failed: ${(error as Error).message}`);
    }
  }
}
